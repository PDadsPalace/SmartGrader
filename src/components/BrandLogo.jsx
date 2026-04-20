export function BrandLogo({ className = "" }) {
  return (
    <span className={`font-bold tracking-tight text-[#760296] ${className} inline-flex items-center`}>
      SmartGr
      <span className="text-[#5cb85c] px-[0.02em] flex items-baseline">
        A<span style={{ fontFamily: 'Georgia, serif', lineHeight: '1' }} className="font-bold">I</span>
      </span>
      der
    </span>
  );
}
