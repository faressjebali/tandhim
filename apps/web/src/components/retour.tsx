import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function LienRetour({
  href,
  children = 'Retour',
}: {
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold">
      <ArrowLeft size={18} strokeWidth={2.4} aria-hidden />
      {children}
    </Link>
  );
}
