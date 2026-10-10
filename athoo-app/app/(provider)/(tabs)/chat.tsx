import { ConversationListScreen } from "@/components/chat/ConversationListScreen";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

export default function ProviderChatScreen() {
  // Route-level subscriptions keep the tab re-rendering with the active
  // theme and language; the shared screen consumes them internally too.
  useTheme();
  useLang();
  return <ConversationListScreen role="provider" />;
}
