import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareSpace",
  description:
    "Map what a food pantry can actually hold, zone by zone, so no shelf sits empty while families go unfed.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Phone shaped, because the scan step happens standing in a pantry
            holding a phone. On desktop it sits in a device frame for demos. */}
        <div className="min-h-dvh flex justify-center sm:py-8">
          <div className="w-full sm:max-w-[420px] bg-surface sm:rounded-[28px] sm:shadow-xl sm:border sm:border-line overflow-hidden flex flex-col min-h-dvh sm:min-h-[860px]">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
