import { GuildSelector } from "./guild-selector";

export default function GuildSelectionPage() {
  return (
    <main>
      <h1>Select a server</h1>
      <p>Only servers where you have access and this bot is installed are shown.</p>
      <GuildSelector />
    </main>
  );
}
