import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCustomers } from '@/hooks/useCustomers';
import { Spinner } from '@/components/ui/Spinner';
import { Search, Users } from 'lucide-react';

export function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: customers, isLoading } = useCustomers();

  const filteredCustomers = customers?.filter(
    (customer) =>
      customer.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone?.includes(searchQuery) ||
      customer.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <h1 className="text-2xl font-bold text-text-primary">Customers</h1>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : !filteredCustomers?.length ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 mx-auto text-text-secondary mb-4" />
          <p className="text-text-secondary">No customers found</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border divide-y divide-border">
          {filteredCustomers.map((customer) => (
            <Link
              key={customer.id}
              to={`/customers/${customer.id}`}
              className="flex items-center justify-between p-4 hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  {customer.photoUrl ? (
                    <img
                      src={customer.photoUrl}
                      alt={customer.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-primary font-medium">
                      {customer.name?.charAt(0) || '?'}
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-medium text-text-primary">
                    {customer.name}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {customer.phone}
                  </p>
                  {customer.email && (
                    <p className="text-xs text-text-secondary">
                      {customer.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="text-right">
                <p className="text-sm text-text-secondary">
                  {customer.loyaltyPoints || 0} pts
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
