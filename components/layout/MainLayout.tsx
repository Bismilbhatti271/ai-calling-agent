import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface MainLayoutProps {
  children: React.ReactNode;
  title: string;
  breadcrumbs?: Array<{
    label: string;
    href?: string;
  }>;
}

export function MainLayout({ children, title, breadcrumbs }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header title={title} breadcrumbs={breadcrumbs} />
      <main className="ml-64 mt-16 p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
