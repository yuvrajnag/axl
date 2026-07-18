import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxlEngine, PermissionError, BackendError } from '../src/engine.js';
import crypto from 'crypto';

describe('AxlEngine', () => {
  let manifest: any;
  let engine: any;

  beforeEach(() => {
    manifest = {
      app: { base_url: 'http://localhost' },
      actions: {
        public_action: { permission: 'PUBLIC', endpoint: { path: '/public', method: 'GET' }, input: {} },
        auth_action: { permission: 'AUTH', endpoint: { path: '/auth', method: 'GET' }, input: {} },
        otp_action: { permission: 'AUTH', confirm: 'OTP', endpoint: { path: '/otp', method: 'POST' }, input: {} },
        workflow_step1: { permission: 'PUBLIC', endpoint: { path: '/s1', method: 'POST' }, input: {} },
        workflow_step2: { permission: 'PUBLIC', endpoint: { path: '/s2', method: 'POST' }, input: { id: { type: 'string', required: true } } }
      },
      workflows: [
        {
          name: 'test_workflow',
          steps: [
            'workflow_step1',
            { action: 'workflow_step2', bindings: [{ sourceStep: 'workflow_step1', sourceField: 'outId', targetField: 'id' }] }
          ]
        },
        {
          name: 'missing_binding_workflow',
          steps: [
             { action: 'workflow_step2', bindings: [] } // missing required id
          ]
        }
      ],
      rateLimits: {
        public_action: '2/sec'
      }
    };
    engine = new AxlEngine(manifest);
    // Mock the actual HTTP call to isolate unit tests
    engine._executeHttp = vi.fn().mockResolvedValue({ success: true, outId: '123' });
  });

  afterEach(() => {
    engine.destroy();
    vi.restoreAllMocks();
  });

  describe('checkPermission', () => {
    it('allows PUBLIC without session', () => {
      expect(() => engine.checkPermission(manifest.actions.public_action, null)).not.toThrow();
    });

    it('throws PermissionError for AUTH without session', () => {
      expect(() => engine.checkPermission(manifest.actions.auth_action, null)).toThrow(PermissionError);
      expect(() => engine.checkPermission(manifest.actions.auth_action, {})).toThrow(PermissionError);
    });

    it('allows AUTH with session', () => {
      expect(() => engine.checkPermission(manifest.actions.auth_action, { sessionCookie: '123' })).not.toThrow();
    });
  });

  describe('idempotencyCache', () => {
    it('caches based on idempotency key', async () => {
      const context = { sessionCookie: 'user1', idempotencyKey: 'idem1' };
      const res1 = await engine.execute('auth_action', {}, context);
      const res2 = await engine.execute('auth_action', {}, context);
      
      expect(res1).toBe(res2);
      expect(engine._executeHttp).toHaveBeenCalledTimes(1);
    });

    it('executes again for different key', async () => {
      const context1 = { sessionCookie: 'user1', idempotencyKey: 'idem1' };
      const context2 = { sessionCookie: 'user1', idempotencyKey: 'idem2' };
      await engine.execute('auth_action', {}, context1);
      await engine.execute('auth_action', {}, context2);
      
      expect(engine._executeHttp).toHaveBeenCalledTimes(2);
    });
  });

  describe('_checkRateLimit', () => {
    it('enforces rate limits in isolation', async () => {
      await engine._checkRateLimit('public_action', { sessionCookie: 'user1' });
      await engine._checkRateLimit('public_action', { sessionCookie: 'user1' });
      
      // 3rd time should throw, limit is 2/sec
      await expect(engine._checkRateLimit('public_action', { sessionCookie: 'user1' })).rejects.toThrow(/Rate limit exceeded/);
    });
  });

  describe('OTP confirm/reject flow', () => {
    it('creates pending confirmation, allows correct OTP, handles wrong OTP with 5 attempts', async () => {
      const context = { sessionCookie: 'user1' };
      const res = await engine.execute('otp_action', {}, context);
      
      expect(res.confirmationRequired).toBe(true);
      expect(res.token).toBeDefined();
      
      const token = res.token;
      const pendingInfo = await engine.state.get('pendingConfirmations', token);
      const actualOtp = pendingInfo.otp;
      
      // 1st wrong attempt
      await expect(engine.confirmAction(token, 'wrong1')).rejects.toThrow(/Incorrect OTP.*4 attempt/);
      // 2nd wrong attempt
      await expect(engine.confirmAction(token, 'wrong2')).rejects.toThrow(/Incorrect OTP.*3 attempt/);
      // 3rd wrong attempt
      await expect(engine.confirmAction(token, 'wrong3')).rejects.toThrow(/Incorrect OTP.*2 attempt/);
      // 4th wrong attempt
      await expect(engine.confirmAction(token, 'wrong4')).rejects.toThrow(/Incorrect OTP.*1 attempt/);
      
      // The pending confirmation should still exist
      expect(await engine.state.get('pendingConfirmations', token)).toBeDefined();
      
      // 5th wrong attempt cancels it
      await expect(engine.confirmAction(token, 'wrong5')).rejects.toThrow(/Too many incorrect attempts/);
      expect(await engine.state.get('pendingConfirmations', token)).toBeUndefined();
    });

    it('executes action on correct OTP', async () => {
      const context = { sessionCookie: 'user1' };
      const res = await engine.execute('otp_action', {}, context);
      
      const token = res.token;
      const pendingInfo = await engine.state.get('pendingConfirmations', token);
      const actualOtp = pendingInfo.otp;
      
      const finalRes = await engine.confirmAction(token, actualOtp);
      expect(finalRes.success).toBe(true);
      expect(engine._executeHttp).toHaveBeenCalledTimes(1);
      expect(await engine.state.get('pendingConfirmations', token)).toBeUndefined();
    });
  });

  describe('Workflow binding resolution', () => {
    it('resolves USING bindings correctly', async () => {
      const res = await engine.runWorkflow('test_workflow', {}, null);
      
      expect(res.status).toBe('COMPLETED');
      // Step 1 executes
      expect(engine._executeHttp).toHaveBeenNthCalledWith(
        1,
        'workflow_step1',
        expect.anything(),
        {},
        null
      );
      // Step 2 executes with bound arg (id: '123' from step 1's mock output)
      expect(engine._executeHttp).toHaveBeenNthCalledWith(
        2,
        'workflow_step2',
        expect.anything(),
        { id: '123' },
        null
      );
    });

    it('fails clearly on missing required binding', async () => {
      // missing_binding_workflow runs workflow_step2 with no bindings and no initialArgs
      await expect(engine.runWorkflow('missing_binding_workflow', {}, null)).rejects.toThrow(/invalid initial arguments.*\"id\"/is);
    });
  });

  describe('Workflow IF/ELSE branching', () => {
    it('evaluates IF branch correctly against step outputs', async () => {
      manifest.actions.step_gate = { permission: 'PUBLIC', endpoint: { path: '/gate', method: 'GET' }, input: {} };
      manifest.actions.step_then = { permission: 'PUBLIC', endpoint: { path: '/then', method: 'GET' }, input: {} };
      manifest.actions.step_else = { permission: 'PUBLIC', endpoint: { path: '/else', method: 'GET' }, input: {} };
      manifest.workflows.push({
        name: 'test_branch_workflow',
        steps: [
          'step_gate',
          { if: 'step_gate.success', then: ['step_then'], else: ['step_else'] }
        ]
      });

      engine._executeHttp = vi.fn().mockImplementation(async (actionName) => {
        if (actionName === 'step_gate') return { success: true };
        return { done: true };
      });

      await engine.runWorkflow('test_branch_workflow', {}, null);
      
      expect(engine._executeHttp).toHaveBeenCalledWith('step_gate', expect.anything(), expect.anything(), null);
      expect(engine._executeHttp).toHaveBeenCalledWith('step_then', expect.anything(), expect.anything(), null);
      expect(engine._executeHttp).not.toHaveBeenCalledWith('step_else', expect.anything(), expect.anything(), null);
    });

    it('evaluates ELSE branch correctly against step outputs', async () => {
      manifest.actions.step_gate = { permission: 'PUBLIC', endpoint: { path: '/gate', method: 'GET' }, input: {} };
      manifest.actions.step_then = { permission: 'PUBLIC', endpoint: { path: '/then', method: 'GET' }, input: {} };
      manifest.actions.step_else = { permission: 'PUBLIC', endpoint: { path: '/else', method: 'GET' }, input: {} };
      manifest.workflows.push({
        name: 'test_branch_workflow_false',
        steps: [
          'step_gate',
          { if: 'step_gate.success', then: ['step_then'], else: ['step_else'] }
        ]
      });

      engine._executeHttp = vi.fn().mockImplementation(async (actionName) => {
        if (actionName === 'step_gate') return { success: false };
        return { done: true };
      });

      await engine.runWorkflow('test_branch_workflow_false', {}, null);
      
      expect(engine._executeHttp).toHaveBeenCalledWith('step_gate', expect.anything(), expect.anything(), null);
      expect(engine._executeHttp).not.toHaveBeenCalledWith('step_then', expect.anything(), expect.anything(), null);
      expect(engine._executeHttp).toHaveBeenCalledWith('step_else', expect.anything(), expect.anything(), null);
    });
  });
});
