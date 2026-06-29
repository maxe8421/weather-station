export default function Header() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-sky-500" aria-hidden="true">
            <path
              d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 17 18H7Z"
              fill="currentColor"
              opacity="0.9"
            />
          </svg>
          Weather Station
        </a>
        <a href="/stations" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
          Manage stations
        </a>
      </div>
    </header>
  );
}
