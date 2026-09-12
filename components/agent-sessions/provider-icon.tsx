import {
  AgentClaudeIcon,
  AgentCodexIcon,
  AgentGeminiIcon,
  AgentOtherIcon,
} from "@/components/ui/icons";
import type { AgentProvider } from "@/lib/data/types";

const ICONS: Record<AgentProvider, (props: { size?: number; className?: string }) => React.ReactNode> = {
  claude: AgentClaudeIcon,
  codex: AgentCodexIcon,
  gemini: AgentGeminiIcon,
  other: AgentOtherIcon,
};

export function ProviderIcon({ provider, size = 14 }: { provider: AgentProvider; size?: number }) {
  const Icon = ICONS[provider];
  return <Icon size={size} />;
}
