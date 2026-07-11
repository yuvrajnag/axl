import crypto from "crypto";

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
  constructor(manifest) {
    this.manifest = manifest;
    // pending confirmations: token -> { actionName, args, context, expiresAt }
    this.pendingConfirmations = new Map();
    this.idempotencyCache = new Map();
    // paused workflows: token -> workflow state
    this.pausedWorkflows = new Map();
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
    const res = await fetch(finalUrl, fetchOpts);
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

    let cacheKey;
    if (context && context.idempotencyKey) {
      cacheKey = `${context.sessionCookie || 'anon'}:${actionName}:${context.idempotencyKey}`;
      if (this.idempotencyCache.has(cacheKey)) {
        return this.idempotencyCache.get(cacheKey);
      }
    }

    if (actionDef.confirm === "OTP") {
      const token = crypto.randomUUID();
      const otp = String(crypto.randomInt(100000, 999999));
      this.pendingConfirmations.set(token, {
        actionName, args, context, otp,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
      });
      const result = {
        confirmationRequired: true,
        token,
        // In production this gets sent via SMS/email, never returned in the
        // response. Returned here only because this is a demo environment.
        otp_demo_only: otp,
        message: `Action "${actionName}" requires confirmation. Call confirm_action with this token and the OTP.`,
      };
      
      if (cacheKey) {
        this.idempotencyCache.set(cacheKey, result);
      }
      
      return result;
    }

    const result = await this._executeHttp(actionName, actionDef, args, context);
    if (cacheKey) {
      this.idempotencyCache.set(cacheKey, result);
    }
    return result;
  }

  /**
   * Second phase of a confirm-gated action.
   */
  async confirmAction(token, submittedOtp) {
    const pending = this.pendingConfirmations.get(token);
    if (!pending) {
      throw new Error("Invalid or expired confirmation token.");
    }
    if (Date.now() > pending.expiresAt) {
      this.pendingConfirmations.delete(token);
      throw new Error("Confirmation token expired.");
    }
    if (submittedOtp !== pending.otp) {
      // Do NOT delete the pending confirmation on a wrong guess -- that
      // would let one typo permanently cancel a legitimate action. Instead
      // cap retries, so brute-forcing the 6-digit OTP is still bounded.
      pending.attempts = (pending.attempts || 0) + 1;
      if (pending.attempts >= 5) {
        this.pendingConfirmations.delete(token);
        throw new Error("Too many incorrect attempts. Action cancelled -- please retry from the start.");
      }
      throw new Error(`Incorrect OTP. ${5 - pending.attempts} attempt(s) remaining.`);
    }

    this.pendingConfirmations.delete(token);
    const actionDef = this.getActionDef(pending.actionName);
    const result = await this._executeHttp(pending.actionName, actionDef, pending.args, pending.context);
    
    // Update cache with the final executed result
    if (pending.context && pending.context.idempotencyKey) {
      const cacheKey = `${pending.context.sessionCookie || 'anon'}:${pending.actionName}:${pending.context.idempotencyKey}`;
      this.idempotencyCache.set(cacheKey, result);
    }
    
    return result;
  }

  /**
   * Starts a workflow execution.
   */
  async runWorkflow(workflowName, initialArgs, context) {
    const workflowDef = this.getWorkflowDef(workflowName);
    
    return this._continueWorkflow({
      workflowName,
      remainingSteps: [...workflowDef.steps],
      args: { ...initialArgs },
      context,
      workflowRunId: crypto.randomUUID()
    });
  }

  /**
   * Internal loop to run workflow steps until completion or pause.
   */
  async _continueWorkflow(state) {
    const workflowDef = this.getWorkflowDef(state.workflowName);
    
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

      const actionName = step;
      
      const result = await this.execute(actionName, state.args, state.context);
      
      if (result && result.confirmationRequired) {
        this.pausedWorkflows.set(result.token, state);
        return {
          ...result,
          message: `Workflow "${state.workflowName}" paused at step "${actionName}" for confirmation. Call resume_workflow with this token and the OTP.`
        };
      }
      
      if (result && typeof result === "object") {
        state.args[actionName] = result;
        state.args = { ...state.args, ...result };
      }
      
      state.remainingSteps.shift();
    }
    
    return {
      status: "COMPLETED",
      workflowRunId: state.workflowRunId,
      finalResult: state.args
    };
  }

  /**
   * Resumes a paused workflow.
   */
  async resumeWorkflow(token, submittedOtp) {
    const state = this.pausedWorkflows.get(token);
    if (!state) {
      throw new Error("Invalid or expired workflow run token.");
    }
    
    // This will throw if OTP is incorrect or expired.
    // Also it handles the actual execution of the paused action.
    const result = await this.confirmAction(token, submittedOtp);
    
    this.pausedWorkflows.delete(token);
    
    if (result && typeof result === "object") {
      const actionName = state.remainingSteps[0];
      state.args[actionName] = result;
      state.args = { ...state.args, ...result };
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
