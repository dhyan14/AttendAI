import BottomNav from "@/components/layout/BottomNav";

export default function FacultyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav role="faculty" />
    </>
  );
}
