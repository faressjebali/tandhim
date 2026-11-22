/** Logo typographique : « Tandhim » et son origine arabe « تنظيم » (organisation). */
export function Marque({ grande = false }: { grande?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={`bloc flex items-center justify-center bg-jaune text-sur-couleur ${grande ? 'h-14 w-14 text-[28px]' : 'h-10 w-10 text-[19px]'}`}
        style={{ borderRadius: grande ? 16 : 12 }}
        lang="ar"
      >
        ت
      </span>
      <span className="flex flex-col leading-none">
        <span className={`titre text-encre ${grande ? 'text-[34px]' : 'text-[22px]'}`}>
          Tandhim
        </span>
        <span
          lang="ar"
          dir="rtl"
          className={`self-start text-gris ${grande ? 'text-[17px]' : 'text-[13px]'}`}
        >
          تنظيم
        </span>
      </span>
    </div>
  );
}
