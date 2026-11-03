import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-panel flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Image
          src="/assets/e486f0721487-fxem-final-logo-1024x351.png"
          alt="FXEM"
          width={1024}
          height={351}
          priority
          className="mx-auto mb-2 h-auto w-40"
        />
        <div className="rounded-xl bg-white p-2 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
