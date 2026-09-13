// A deterministic identicon derived purely from the address string — no
// external avatar service, no network request, nothing that would leak an
// address to a third party just to draw a picture next to it. Same address
// always renders the same avatar, same shape GitHub's own identicons use:
// a mirrored grid, colored from a hash of the input.
function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function AddressAvatar({ address, size = 40 }: { address: string; size?: number }) {
  const seed = hashCode(address.toLowerCase());
  const hue = ((seed % 360) + 360) % 360;
  const bg = `hsl(${hue}, 45%, 18%)`;
  const fg = `hsl(${hue}, 70%, 65%)`;
  const cellSize = size / 5;

  const rects: React.ReactNode[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const bit = (seed >> (row * 3 + col)) & 1;
      if (!bit) continue;
      rects.push(
        <rect key={`${row}-${col}`} x={col * cellSize} y={row * cellSize} width={cellSize} height={cellSize} fill={fg} />
      );
      if (col < 2) {
        rects.push(
          <rect
            key={`${row}-${col}-mirror`}
            x={(4 - col) * cellSize}
            y={row * cellSize}
            width={cellSize}
            height={cellSize}
            fill={fg}
          />
        );
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="rounded-md shrink-0"
      role="img"
      aria-label={`Avatar for ${address}`}
    >
      <rect width={size} height={size} fill={bg} />
      {rects}
    </svg>
  );
}
