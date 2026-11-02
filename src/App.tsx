import AuthGate from './features/aquila/AuthGate'
import ImportPage from './features/aquila/capture/ImportPage'
import ListingDetailPage from './features/aquila/ListingDetailPage'
import ListingsPage from './features/aquila/ListingsPage'
import NewListingForm from './features/aquila/NewListingForm'
import { hrefFor, navigate, useHashRoute } from './features/aquila/router'

function Routes() {
  const route = useHashRoute()
  switch (route.name) {
    case 'new-listing':
      return <NewListingForm onCreated={(id) => navigate(hrefFor.listing(id))} />
    case 'listing':
      return <ListingDetailPage key={route.id} id={route.id} />
    case 'import':
      return <ImportPage key={route.id} listingId={route.id}
        onSaved={() => navigate(hrefFor.listing(route.id))} />
    default:
      return <ListingsPage />
  }
}

export default function App() {
  return (
    <AuthGate>
      <div className="min-h-screen bg-slate-900 text-white">
        <nav className="border-b border-slate-700 px-6 py-3">
          <a href={hrefFor.listings()} className="text-lg font-bold">AQUILA</a>
        </nav>
        <main className="mx-auto max-w-5xl p-6">
          <Routes />
        </main>
      </div>
    </AuthGate>
  )
}
