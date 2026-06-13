import BottomNav from "@/components/layout/BottomNav";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav role="student" />
    </>
  );
}
