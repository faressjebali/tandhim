/** Squelette affiché instantanément pendant le chargement d'un onglet. */
export default function Chargement() {
  return (
    <div aria-busy="true" aria-label="Chargement" className="animate-pulse">
      <div className="mb-5 flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-32 rounded-full bg-ligne" />
          <div className="h-8 w-48 rounded-xl bg-ligne" />
        </div>
        <div className="h-10 w-24 rounded-full bg-ligne" />
      </div>
      <div className="mb-7 flex gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-16 w-11 rounded-2xl bg-ligne" />
        ))}
      </div>
      <div className="mb-8 flex gap-3">
        <div className="h-36 w-60 rounded-[18px] bg-ligne" />
        <div className="h-36 w-48 rounded-[18px] bg-ligne" />
      </div>
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 w-full rounded-[18px] bg-ligne" />
        ))}
      </div>
    </div>
  );
}
