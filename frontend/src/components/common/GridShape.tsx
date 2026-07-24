/** Decorative concentric-ring background used on the auth screen. */
export default function GridShape() {
  return (
    <>
      <div className="pointer-events-none absolute right-0 top-0 -z-10 w-full max-w-[250px] xl:max-w-[450px]">
        <div className="aspect-square rounded-full bg-white/5 [background:radial-gradient(circle,transparent_60%,rgba(255,255,255,0.06)_61%)]" />
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 -z-10 w-full max-w-[250px] rotate-180 xl:max-w-[450px]">
        <div className="aspect-square rounded-full bg-white/5 [background:radial-gradient(circle,transparent_60%,rgba(255,255,255,0.06)_61%)]" />
      </div>
    </>
  );
}
