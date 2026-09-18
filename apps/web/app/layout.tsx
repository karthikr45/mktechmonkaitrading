import "./globals.css";
export const metadata = {
  title: "MKTechMonk · Trading intelligence",
  description: "Synthetic research and paper execution workspace",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
