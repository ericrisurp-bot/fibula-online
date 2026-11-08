type BackToLobbyButtonProps = { onClick: () => void };

export default function BackToLobbyButton({ onClick }: BackToLobbyButtonProps) {
  return <button type="button" className="back-to-lobby-button" onClick={onClick}>← Lobby</button>;
}
