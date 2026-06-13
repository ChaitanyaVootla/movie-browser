interface StatTile {
  label: string;
  value: string;
}

/** Headline number tiles (DESIGN.md card recipe). */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl border bg-card p-4">
          <p className="text-2xl md:text-3xl font-bold tracking-tight">{tile.value}</p>
          <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}
