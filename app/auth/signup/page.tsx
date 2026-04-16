import { redirect } from 'next/navigation';

// Registration is disabled. Only Supabase dashboard can create users.
export default function SignupPage() {
  redirect('/auth/login');
}
