'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { api } from '@/lib/api';
import { Upload, Mail, Phone, FileText, Eye, EyeOff, RotateCw } from 'lucide-react';

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    about: user?.about || '',
    avatar: user?.avatar || '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        about: user.about || '',
        avatar: user.avatar || '',
      });
    }
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setFormData((prev) => ({ ...prev, avatar: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    if (!formData.name || !formData.email) {
      setMessage({ type: 'error', text: 'Name and email are required' });
      return;
    }
    setSaving(true);
    try {
      await updateProfile(formData);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    }
    setSaving(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleChangePassword = async () => {
    if (!password || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please fill in all fields' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    setChangingPw(true);
    try {
      // For now, we can't change password without old password from UI
      // We'll use an empty old password - the backend will reject it
      // In a real app you'd add a current password field
      alert('Password change requires current password verification. This will be available in the next update.');
    } catch {
      setMessage({ type: 'error', text: 'Failed to change password' });
    }
    setChangingPw(false);
    setPassword('');
    setConfirmPassword('');
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <ProtectedRoute>
      <MainLayout title="Settings" breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Settings' }]}>
        <div className="space-y-6 max-w-4xl">
          <Card>
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-6">Profile Settings</h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-1 flex flex-col items-center">
                  <div onClick={handleAvatarClick}
                    className="relative w-32 h-32 rounded-lg glass cursor-pointer hover:bg-white/10 transition-colors group overflow-hidden">
                    <img src={formData.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Upload className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                  <p className="text-xs text-muted-foreground mt-3 text-center">Click to upload a new avatar</p>
                  <p className="text-xs text-gray-600 mt-1">Recommended: 400x400px</p>
                </div>
                <div className="md:col-span-2 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Full Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleInputChange}
                      className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors"
                      placeholder="Your full name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input type="email" name="email" value={formData.email} onChange={handleInputChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors"
                        placeholder="your@email.com" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors"
                        placeholder="+1-555-0100" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <label className="block text-sm font-medium mb-2">About</label>
                <textarea name="about" value={formData.about} onChange={handleInputChange} rows={4}
                  className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors resize-none"
                  placeholder="Tell us about yourself..." />
                <p className="text-xs text-muted-foreground mt-1">Max 500 characters</p>
              </div>
              <button onClick={handleSaveProfile} disabled={saving}
                className="mt-6 px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? <span className="flex items-center gap-2"><RotateCw size={16} className="animate-spin" /> Saving...</span> : 'Save Profile'}
              </button>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-6">Security & Password</h2>
              <div className="space-y-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium mb-2">Current Password</label>
                  <input type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors"
                    placeholder="Enter current password" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">New Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors pr-10"
                      placeholder="Enter new password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <button onClick={handleChangePassword} disabled={changingPw}
                  className="px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {changingPw ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <FileText className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-xl font-semibold">Terms & Conditions</h2>
                  <p className="text-sm text-muted-foreground mt-1">Last updated: June 2024</p>
                </div>
              </div>
              <div className="prose prose-invert max-w-none text-sm space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">1. Service Agreement</h3>
                  <p className="text-muted-foreground">By accessing and using the Empire-X AI Calling Platform, you agree to be bound by these Terms & Conditions.</p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">2. User Responsibilities</h3>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>Users are responsible for maintaining the confidentiality of account credentials</li>
                    <li>All calls must comply with local and national regulations</li>
                    <li>Users agree not to use the platform for illegal or harmful purposes</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">3. API Usage Policy</h3>
                  <p className="text-muted-foreground">API keys must be kept private and secure. Rate limits apply to all endpoints.</p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">4. Compliance</h3>
                  <p className="text-muted-foreground">Users must comply with all applicable laws including telemarketing laws, GDPR, CCPA.</p>
                </div>
              </div>
            </div>
          </Card>

          {message && (
            <div className={`fixed bottom-6 right-6 px-6 py-3 rounded-lg text-sm font-medium transition-all z-50 ${
              message.type === 'success' ? 'bg-green-500/20 border border-green-500/50 text-green-200' : 'bg-red-500/20 border border-red-500/50 text-red-200'
            }`}>
              {message.text}
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
