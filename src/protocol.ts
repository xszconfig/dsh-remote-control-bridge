/**
 * Wire protocol types shared between the bridge plugin and the mobile client.
 * Pure JSON shapes — no dsh types here so the mobile side can mirror them 1:1.
 */

// ---- data models (s -> c snapshots) ----

export type AgentStatusWire = 'idle' | 'running'

export interface SessionSummary {
  id: string
  /** Desktop display title: durable title, cwd basename, then id. */
  name: string
  cwd: string
  /** Workspace this session belongs to; null = ungrouped. */
  workspaceId: string | null
  status: AgentStatusWire
  agentCount: number
  subagentCount: number
  updatedAt: number
}

export interface WorkspaceSummary {
  id: string
  title: string
  path: string
  sessionCount: number
}

export interface AgentSummary {
  sessionId: string
  role: 'primary' | 'subagent'
  status: AgentStatusWire
  depth: number
}

export type EventKind =
  | 'user_message'
  | 'assistant_message'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'system'

export interface EventProjection {
  seq: number
  type: EventKind
  text?: string
  toolName?: string
  toolArgs?: string
  toolResult?: string
  toolError?: boolean
  timestamp: number
}

export interface ApprovalRequestWire {
  approvalId: string
  sessionId: string
  toolName: string
  reason?: string
}

// ---- client -> server commands ----

export interface CmdSubscribe {
  type: 'subscribe'
  sessionId?: string
}
export interface CmdSendMessage {
  type: 'send_message'
  sessionId: string
  text: string
}
export interface CmdInterrupt {
  type: 'interrupt'
  sessionId: string
}
export interface CmdApprove {
  type: 'approve'
  approvalId: string
  decision: 'allowed-once' | 'rejected'
}
export interface CmdList {
  type: 'list'
}
/** Pair a phone with the desktop: exchange a long-lived per-device token. */
export interface CmdRegisterDevice {
  type: 'register_device'
  deviceId: string
  name: string
  model?: string
}
/** Revoke a previously registered device token. */
export interface CmdRevokeDevice {
  type: 'revoke_device'
  deviceId: string
}

export type ClientCommand =
  | CmdSubscribe
  | CmdSendMessage
  | CmdInterrupt
  | CmdApprove
  | CmdList
  | CmdRegisterDevice
  | CmdRevokeDevice

// ---- server -> client events ----

export interface EvHello {
  type: 'hello'
  version: string
  /** Stable per-machine fingerprint of this DeepSeek Harness host. */
  serverId: string
  /** OS hostname of the desktop, used as the default device name. */
  hostname: string
  sessions: SessionSummary[]
  agents: AgentSummary[]
  /** Workspaces in durable registry order. */
  workspaces: WorkspaceSummary[]
}
export interface EvSessions {
  type: 'sessions'
  sessions: SessionSummary[]
}
export interface EvAgents {
  type: 'agents'
  agents: AgentSummary[]
}
export interface EvEvent {
  type: 'event'
  sessionId: string
  event: EventProjection
}
export interface EvAgentStatus {
  type: 'agent_status'
  sessionId: string
  status: AgentStatusWire
}
export interface EvApprovalRequest {
  type: 'approval_request'
  approval: ApprovalRequestWire
}
export interface EvApprovalSettled {
  type: 'approval_settled'
  approvalId: string
  outcome: string
}
export interface EvHistory {
  type: 'history'
  sessionId: string
  events: EventProjection[]
}
/** A session's durable title changed (user rename or automatic generation). */
export interface EvSessionTitle {
  type: 'session_title'
  sessionId: string
  title: string
}
export interface EvError {
  type: 'error'
  code: string
  message: string
}
/** Answer to register_device: the phone stores this token for reconnects. */
export interface EvDeviceRegistered {
  type: 'device_registered'
  deviceId: string
  deviceToken: string
  serverId: string
  hostname: string
}
export interface EvDeviceRevoked {
  type: 'device_revoked'
  deviceId: string
}

export type ServerEvent =
  | EvHello
  | EvSessions
  | EvAgents
  | EvEvent
  | EvHistory
  | EvSessionTitle
  | EvAgentStatus
  | EvApprovalRequest
  | EvApprovalSettled
  | EvError
  | EvDeviceRegistered
  | EvDeviceRevoked

// ---- REST surfaces ----

export interface PingInfo {
  ok: true
  version: string
  serverId: string
  hostname: string
  sessions: number
}

/** Payload embedded in the pairing QR code (scanned by the phone). */
export interface PairQrPayload {
  v: 1
  t: 'dsh-remote'
  serverId: string
  hostname: string
  expiresAt: number
  /** Candidate ws URLs, most-preferred first. */
  urls: string[]
}

export interface PairInfo extends PairQrPayload {
  bindHost: '127.0.0.1' | '0.0.0.0'
  port: number
}

export interface DeviceRecord {
  deviceId: string
  name: string
  model?: string
  createdAt: number
  lastSeenAt: number
}

export const BRIDGE_VERSION = '0.3.0'
