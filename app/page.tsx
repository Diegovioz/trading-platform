import { redirect } from 'next/navigation';

// Root page — middleware handles routing.
// If we reach here the user is authenticated → redirect to dashboard.
export default function RootPage() {
  redirect('/dashboard');
}
