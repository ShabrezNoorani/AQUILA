import AuthGate from './features/aquila/AuthGate'
import ImportPage from './features/aquila/capture/ImportPage'
import ListingDetailPage from './features/aquila/ListingDetailPage'
import ListingsPage from './features/aquila/ListingsPage'
import NewListingForm from './features/aquila/NewListingForm'
import TagsPage from './features/aquila/tags/TagsPage'
import AskPage from './features/aquila/ask/AskPage'
import HelpPage from './features/aquila/help/HelpPage'
import CompaniesPage from './features/aquila/companies/CompaniesPage'
import { hrefFor, navigate, useHashRoute } from './features/aquila/router'
import { AppShell } from './features/aquila/ui'

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
    case 'tags':
      return <TagsPage />
    case 'ask':
      return <AskPage />
    case 'help':
      return <HelpPage />
    case 'companies':
      return <CompaniesPage />
    case 'company':
      return <CompaniesPage key={route.id} companyId={route.id} />
    default:
      return <ListingsPage />
  }
}

/** The app frame, with the sidebar item for the current page highlighted. */
function Layout() {
  const route = useHashRoute()
  return (
    <AppShell active={
      route.name === 'tags' ? 'tags'
        : route.name === 'ask' ? 'ask'
          : route.name === 'companies' || route.name === 'company' ? 'companies'
            : 'listings'
    }>
      <main>
        <Routes />
      </main>
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthGate>
      <Layout />
    </AuthGate>
  )
}
