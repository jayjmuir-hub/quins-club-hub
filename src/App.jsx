import crest from './assets/crest.png'

export default function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[image:linear-gradient(100deg,theme(colors.quinsRedDark)_0%,theme(colors.quinsRed)_42%,#B23A38_62%,theme(colors.quinsGreen)_100%)] px-6 text-center text-white">
      <img src={crest} alt="Abu Dhabi Harlequins crest" className="h-24 w-24 drop-shadow-lg" />
      <h1 className="text-2xl font-extrabold tracking-tight">Abu Dhabi Harlequins</h1>
      <p className="text-sm font-semibold uppercase tracking-widest opacity-80">
        Quins Club Hub
      </p>
    </div>
  )
}
