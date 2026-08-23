import { useState } from 'react';
import { useBranches } from '@/hooks/useBranches';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Building2, Plus, MapPin, Phone, Clock, X } from 'lucide-react';

export function BranchesPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const { branches, isLoading, toggleBranchStatus } = useBranches();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Branch Network</h1>
          <p className="text-sm text-text-secondary">
            Manage restaurant outlets, operating status, and branch assignments.
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary-dark shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Branch</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : !branches?.length ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-border">
          <Building2 className="w-12 h-12 mx-auto text-text-secondary mb-4 opacity-50" />
          <h3 className="font-semibold text-text-primary">No branches cataloged yet</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-sm mx-auto">
            Click "Add New Branch" above to configure your first restaurant outlet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="bg-surface rounded-2xl border border-border p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-bold text-text-primary text-base">
                      {branch.name}
                    </h3>
                    <p className="text-xs font-semibold text-primary mt-0.5">
                      {branch.city}
                    </p>
                  </div>
                  <Badge
                    className={
                      branch.active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }
                  >
                    {branch.active ? 'Accepting Orders' : 'Store Offline'}
                  </Badge>
                </div>

                {/* Details */}
                <div className="space-y-2 py-3 border-y border-border/60 text-xs text-text-secondary">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-text-secondary shrink-0 mt-0.5" />
                    <span className="line-clamp-2 leading-relaxed">{branch.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                    <span>{branch.phone || 'No direct phone added'}</span>
                  </div>
                  {branch.operatingHours && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                      <span>
                        {branch.operatingHours.open} – {branch.operatingHours.close}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Action CTA */}
              <div className="pt-4 mt-2">
                <button
                  onClick={() =>
                    toggleBranchStatus.mutate({
                      branchId: branch.id,
                      active: !branch.active,
                    })
                  }
                  disabled={toggleBranchStatus.isPending}
                  className={`w-full py-2.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer ${
                    branch.active
                      ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
                      : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-100'
                  }`}
                >
                  {branch.active ? 'Deactivate / Close Store' : 'Activate / Open Store'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Branch Modal */}
      {showAddForm && <AddBranchModal onClose={() => setShowAddForm(false)} />}
    </div>
  );
}

function AddBranchModal({ onClose }: { onClose: () => void }) {
  const { createBranch } = useBranches();
  const [formData, setFormData] = useState({
    name: '',
    city: 'Ahmedabad',
    address: '',
    phone: '',
    openHours: '10:00',
    closeHours: '23:00',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createBranch.mutateAsync({
      name: formData.name,
      city: formData.city,
      address: formData.address,
      phone: formData.phone,
      active: true,
      coordinates: { lat: 23.0225, lng: 72.5714 },
      operatingHours: { open: formData.openHours, close: formData.closeHours },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-6 border border-border shadow-xl">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">Add New Branch</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-primary/5 rounded-lg text-text-secondary cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Branch Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Burgonomics Prahlad Nagar"
              className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                City
              </label>
              <select
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
              >
                <option value="Ahmedabad">Ahmedabad</option>
                <option value="Surat">Surat</option>
                <option value="Vadodara">Vadodara</option>
                <option value="Gandhinagar">Gandhinagar</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Store Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Full Street Address
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={2}
              placeholder="Shop 4, Ground Floor, Corporate Road..."
              className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50 resize-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Opens At
              </label>
              <input
                type="time"
                value={formData.openHours}
                onChange={(e) => setFormData({ ...formData, openHours: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Closes At
              </label>
              <input
                type="time"
                value={formData.closeHours}
                onChange={(e) => setFormData({ ...formData, closeHours: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-xl font-semibold text-xs hover:bg-primary/5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createBranch.isPending}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl font-semibold text-xs hover:bg-primary-dark disabled:opacity-50 shadow-xs cursor-pointer"
            >
              {createBranch.isPending ? 'Creating...' : 'Register Outlet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BranchesPage;
