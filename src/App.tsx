import AuthGate from './features/aquila/AuthGate'

export default function App() {
  return (
    <AuthGate>
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <h1 className="text-4xl font-bold">AQUILA: hello world</h1>
      </div>
    </AuthGate>
  )
}
