import type { ProbeAttempt, ProbeRequestRecord } from '../api';

export const endpointLabel: Record<string, string> = {
  openai_chat_completions: 'Chat Completions',
  openai_responses: 'Responses',
  anthropic_messages: 'Anthropic Messages',
  gemini_stream_generate_content: 'Gemini Stream',
};

export const degradationFlagLabel: Record<string, string> = {
  openai_responses_fallback: 'Responses 回退',
  empty_success_response: '空响应',
  very_slow_first_token: '首 token 过慢',
  context_limit_error: '上下文受限',
  token_limit_signal: '输出受限',
  wrapper_suspected: '疑似套壳风险',
  quota_or_credit_error: '额度异常',
  rate_limited: '限流',
  diagnostic_probe_failed: '诊断失败',
  reasoning_probe_failed: '推理探针失败',
  instruction_following_failed: '指令遵循失败',
  spurious_refusal: '异常拒答',
  veridrop_passed: '深度检测通过',
  veridrop_marginal: '深度检测存疑',
  veridrop_failed: '深度检测失败',
  deep_detection_error: '深度检测异常',
};

export const capabilityFlagLabel: Record<string, string> = {
  streaming_verified: '流式可用',
  vision_declared: '视觉模型',
  tool_calling_likely: '工具调用',
  protocol_anthropic: 'Claude 协议',
  protocol_openai: 'OpenAI 协议',
  protocol_gemini: 'Gemini 协议',
  mode_quick: '快速档',
  mode_standard: '标准档',
  mode_full: '完整档',
  tier_cryptographic: '加密级',
  tier_behavioral: '行为级',
  tier_protocol: '协议级',
};

export function hasDiagnosticEvidence(attempts: ProbeAttempt[]): boolean {
  return attempts.some((attempt) => Boolean(attempt.diagnostic_id));
}

export function diagnosticStatusLabel(
  flags: string[],
  authenticityScore: number | null,
  available: boolean,
  attempts: ProbeAttempt[],
): string | null {
  if (!available) return null;
  if (!hasDiagnosticEvidence(attempts)) return null;
  if (flags.length > 0) return null;
  if (authenticityScore === null) return null;
  return authenticityScore >= 0.95 ? '启发式探针通过' : '低置信启发式通过';
}

export function formatJson(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatRequestRecord(request: ProbeRequestRecord | undefined): string {
  if (!request) return '-';
  return formatJson({
    headers: request.headers ?? {},
    body: request.body,
  });
}

export function parseAttempts(value: string | null): ProbeAttempt[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as ProbeAttempt[];
  } catch {
    /* fall through */
  }
  return [];
}

export function parseRequests(value: string | null): ProbeRequestRecord[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as ProbeRequestRecord[];
  } catch {
    /* fall through */
  }
  return [];
}

export function parseFlags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.risks)) {
      return parsed.risks.filter((item: unknown): item is string => typeof item === 'string');
    }
  } catch {
    /* fall through */
  }
  return [];
}

export function parseCapabilityFlags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.capabilities)) {
      return parsed.capabilities.filter((item: unknown): item is string => typeof item === 'string');
    }
  } catch {
    /* fall through */
  }
  return [];
}

export function attemptRole(index: number, attempts: ProbeAttempt[]): string {
  if (attempts.length === 1) return '主用';
  return index === 0 ? '主用' : '回退';
}
