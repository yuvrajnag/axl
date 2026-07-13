import crypto from "crypto";
import { z } from "zod";
import { buildZodShape } from "./schema-utils.js";
import { InMemoryStateStore } from "./state.js";

/**
 * Fills {path_param} placeholders in an endpoint path using values from args,
 * and returns the remaining args (the ones NOT consumed as path params) as
 * the request body / query.
 */
function buildUrl(baseUrl, endpointPath, args) {
  const remaining = { ...args };
  const filledPath = endpointPath.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in remaining)) {
      throw new Error(`Missing required path parameter: ${key}`);
    }
    const val = remaining[key];
    delete remaining[key];
    return encodeURIComponent(val);
  });
  return { url: baseUrl + filledPath, remaining };
}

/**
 * The AXL execution engine. One instance per loaded manifest.
 *
 * Responsibilities (in order, every single call):
 *   1. Does this action exist at all?
 *   2. Permission check (PUBLIC vs AUTH)
 *   3. Confirm-gate check (OTP) -- two-phase: request, then confirm
 *   4. Execute the real HTTP call against the site's own backend
 */
export class AxlEngine {
  constructor(manifest, stateStore) {
    this.manifest = manifest;
    this.state = stateStore || new InMemoryStateStore();

    // Start cleanup sweep every minute
    this.cleanupInterval = setInterval(() => {
      if (typeof this.state._sweep === 'function') {
        this.state._sweep();
      }
    }, 60000);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  destroy() {
    clearInterval(this.cleanupInterval);
  }

  getActionDef(actionName) {
    const def = this.manifest.actions[actionName];
    if (!def) {
      throw new Error(`Unknown action: "${actionName}"`);
    }
    return def;
  }

  getWorkflowDef(workflowName) {
    const def = this.manifest.workflows?.find(w => w.name === workflowName);
    if (!def) {
      throw new Error(`Unknown workflow: "${workflowName}"`);
    }
    return def;
  }

  /**
   * context = { sessionCookie: string | null }
   * Represents the authenticated end-user's session, passed through from
   * whatever client (Thunderstrike, Claude, etc.) is calling the MCP tool.
   */
  checkPermission(actionDef, context) {
    if (actionDef.permission === "PUBLIC") return;
    if (actionDef.permission === "AUTH") {
      if (!context || !context.sessionCookie) {
        throw new PermissionError("This action requires authentication. No session provided.");
      }
      return;
    }
    throw new Error(`Unknown permission level: ${actionDef.permission}`);
  }

  async _checkRateLimit(actionName, context) {
    const rlStr = this.manifest.rateLimits?.[actionName];
    if (!rlStr) return;

    const clientKey = context?.sessionCookie || context?.ip || 'anon';
    const key = `${actionName}:${clientKey}`;

    const match = rlStr.match(/^(\d+)\/(sec|min|hr|day)$/);
    if (!match) return; // ignore invalid formats

    const limit = parseInt(match[1], 10);
    const unit = match[2];
    const msPerUnit = { sec: 1000, min: 60000, hr: 3600000, day: 86400000 }[unit];

    const now = Date.now();
    let record = await this.state.get("rateLimits", key);

    if (record && now > record.windowEnd) {
      await this.state.delete("rateLimits", key);
      record = undefined;
    }

    if (!record) {
      record = { count: 0, windowEnd: now + msPerUnit };
      await this.state.set("rateLimits", key, record, msPerUnit);
    }

    if (record.count >= limit) {
      throw new Error(`Rate limit exceeded for action "${actionName}".`);
    }
    
    // Always re-set since we modified the count
    record.count++;
    await this.state.set("rateLimits", key, record, Math.max(0, record.windowEnd - now));
  }

  /**
   * Runs the real HTTP call against the site's backend. No permission or
   * confirm logic here -- callers must have already cleared those gates.
   */
  async _executeHttp(actionName, actionDef, args, context) {
    const { url, remaining } = buildUrl(this.manifest.app.base_url, actionDef.endpoint.path, args);
    const method = actionDef.endpoint.method;

    const headers = { "Content-Type": "application/json" };
    if (context && context.sessionCookie) {
      headers["Cookie"] = context.sessionCookie;
    }

    const fetchOpts = { method, headers };
    if (method !== "GET" && method !== "DELETE") {
      fetchOpts.body = JSON.stringify(remaining);
    } else if (Object.keys(remaining).length > 0 && method === "GET") {
      const qs = new URLSearchParams(remaining).toString();
      fetchOpts.url = url + "?" + qs;
    }

    const finalUrl = fetchOpts.url || url;
    let res;
    try {
      res = await fetch(finalUrl, fetchOpts);
    } catch (error) {
      throw new BackendError(`Network error connecting to backend: ${error.message}`, 502, { error: error.message });
    }

    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }

    if (!res.ok) {
      throw new BackendError(`Backend returned ${res.status}`, res.status, body);
    }
    return body;
  }

  /**
   * Main entry point. Called by the MCP tool handler for every tool call.
   *
   * If the action requires confirmation and this is the first call,
   * returns a { confirmationRequired: true, token, otp } result instead
   * of executing -- caller must call confirmAction(token, otp) next.
   */
  async execute(actionName, args, context) {
    const actionDef = this.getActionDef(actionName);
    this.checkPermission(actionDef, context);
    await this._checkRateLimit(actionName, context);

    let cacheKey;
    if (context && context.idempotencyKey) {
      cacheKey = `${context.sessionCookie || 'anon'}:${actionName}:${context.idempotencyKey}`;
      const cached = await this.state.get("idempotencyCache", cacheKey);
      if (cached) {
        return cached;
      }
    }

    if (actionDef.confirm === "OTP") {
      const token = crypto.randomUUID();
      const otp = String(crypto.randomInt(100000, 999999));
      await this.state.set("pendingConfirmations", token, {
        actionName, args, context, otp,
        attempts: 0
      }, 5 * 60 * 1000); // 5 min TTL
      
      const result = {
        confirmationRequired: true,
        token,
        // In production this gets sent via SMS/email, never returned in the response.
        ...(process.env.NODE_ENV !== "production" ? { otp_demo_only: otp } : {}),
        message: `Action "${actionName}" requires confirmation. Call confirm_action with this token and the OTP.`,
      };
      
      if (cacheKey) {
        await this.state.set("idempotencyCache", cacheKey, result, 86400000); // 24hr TTL
      }
      
      return result;
    }

    const result = await this._executeHttp(actionName, actionDef, args, context);
    if (cacheKey) {
      await this.state.set("idempotencyCache", cacheKey, result, 86400000); // 24hr TTL
    }
    return result;
  }

  /**
   * Second phase of a confirm-gated action.
   */
  async confirmAction(token, submittedOtp) {
    const pending = await this.state.get("pendingConfirmations", token);
    if (!pending) {
      throw new Error("Invalid or expired confirmation token.");
    }
    if (submittedOtp !== pending.otp) {
      pending.attempts = (pending.attempts || 0) + 1;
      if (pending.attempts >= 5) {
        await this.state.delete("pendingConfirmations", token);
        throw new Error("Too many incorrect attempts. Action cancelled -- please retry from the start.");
      }
      await this.state.set("pendingConfirmations", token, pending, 5 * 60 * 1000);
      throw new Error(`Incorrect OTP. ${5 - pending.attempts} attempt(s) remaining.`);
    }

    await this.state.delete("pendingConfirmations", token);
    const actionDef = this.getActionDef(pending.actionName);
    const result = await this._executeHttp(pending.actionName, actionDef, pending.args, pending.context);
    
    // Update cache with the final executed result
    if (pending.context && pending.context.idempotencyKey) {
      const cacheKey = `${pending.context.sessionCookie || 'anon'}:${pending.actionName}:${pending.context.idempotencyKey}`;
      await this.state.set("idempotencyCache", cacheKey, result, 86400000);
    }
    
    return result;
  }

  /**
   * Starts a workflow execution.
   */
  async runWorkflow(workflowName, initialArgs, context) {
    const workflowDef = this.getWorkflowDef(workflowName);
    
    if (workflowDef.steps.length > 0) {
      const firstStep = workflowDef.steps[0];
      const actionName = typeof firstStep === "string" ? firstStep : firstStep.action;
      if (actionName) {
        const actionDef = this.getActionDef(actionName);
        const schema = z.object(buildZodShape(actionDef.input));
        try {
          schema.parse(initialArgs || {});
        } catch (err) {
          throw new Error(`Invalid initial arguments for workflow "${workflowName}": ${err.message}`);
        }
      }
    }
    
    return this._continueWorkflow({
      workflowName,
      remainingSteps: [...workflowDef.steps],
      args: { ...initialArgs },
      stepOutputs: {},
      context,
      workflowRunId: crypto.randomUUID()
    });
  }

  /**
   * Internal loop to run workflow steps until completion or pause.
   */
  async _continueWorkflow(state) {
    const workflowDef = this.getWorkflowDef(state.workflowName);
    
    // Add stepOutputs if not present
    if (!state.stepOutputs) {
      state.stepOutputs = {};
    }
    
    while (state.remainingSteps && state.remainingSteps.length > 0) {
      const step = state.remainingSteps[0];
      
      if (typeof step === 'object' && step.if) {
        const parts = step.if.split('.');
        let conditionValue = state.args;
        for (const p of parts) {
          conditionValue = conditionValue?.[p];
        }
        
        state.remainingSteps.shift();
        if (conditionValue) {
           state.remainingSteps.unshift(...step.then);
        } else if (step.else) {
           state.remainingSteps.unshift(...step.else);
        }
        continue;
      }

      const isActionStep = typeof step === 'string' || (typeof step === 'object' && step.action);
      if (isActionStep) {
        const actionName = typeof step === 'string' ? step : step.action;
        const bindings = typeof step === 'object' ? (step.bindings || []) : [];
        
        const actionDef = this.getActionDef(actionName);
        const actionArgs = {};
        
        for (const binding of bindings) {
          const sourceData = state.stepOutputs[binding.sourceStep];
          if (!sourceData) {
            throw new Error(`Workflow error: Source step ${binding.sourceStep} output not found.`);
          }
          actionArgs[binding.targetField] = sourceData[binding.sourceField];
        }
        
        // Merge from initialArgs for unbound fields
        for (const inputName of Object.keys(actionDef.input)) {
           if (!(inputName in actionArgs) && (inputName in state.args)) {
               actionArgs[inputName] = state.args[inputName];
           }
        }
        
        const schema = z.object(buildZodShape(actionDef.input));
        try {
          schema.parse(actionArgs);
        } catch (err) {
          throw new Error(`Workflow error at step "${actionName}": invalid inputs. ${err.message}`);
        }
        
        const result = await this.execute(actionName, actionArgs, state.context);
        
        if (result && result.confirmationRequired) {
          await this.state.set("pausedWorkflows", result.token, state, 86400000); // 24hr TTL for paused workflows
          return {
            ...result,
            message: `Workflow "${state.workflowName}" paused at step "${actionName}" for confirmation. Call resume_workflow with this token and the OTP.`
          };
        }
        
        if (result && typeof result === "object") {
          state.stepOutputs[actionName] = result;
        }
        
        state.remainingSteps.shift();
      }
    }
    
    return {
      status: "COMPLETED",
      workflowRunId: state.workflowRunId,
      finalResult: state.stepOutputs
    };
  }

  /**
   * Resumes a paused workflow.
   */
  async resumeWorkflow(token, submittedOtp) {
    const state = await this.state.get("pausedWorkflows", token);
    if (!state) {
      throw new Error("Invalid or expired workflow run token.");
    }
    
    // This will throw if OTP is incorrect or expired.
    // Also it handles the actual execution of the paused action.
    const result = await this.confirmAction(token, submittedOtp);
    
    await this.state.delete("pausedWorkflows", token);
    
    if (result && typeof result === "object") {
      const step = state.remainingSteps[0];
      const actionName = typeof step === "string" ? step : step.action;
      state.stepOutputs[actionName] = result;
    }
    
    state.remainingSteps.shift();
    return this._continueWorkflow(state);
  }
}

export class PermissionError extends Error {}
export class BackendError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}
