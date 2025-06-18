
export default function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-white border border-gray-200 rounded-3xl shadow-lg px-4 md:px-8 py-4 items-center relative z-10"
      style={{ minHeight: '80px' }}
    >
      {children}
    </div>
  );
}