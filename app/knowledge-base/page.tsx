'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { api, Campaign, KnowledgeDocument } from '@/lib/api';
import { Plus, Search, Trash2, Edit2, FileText, BookOpen, Save, X, Loader, RefreshCw } from 'lucide-react';

export default function KnowledgeBasePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeDocument[] | null>(null);

  // Create / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.campaigns.list().then(setCampaigns).catch(() => {});
  }, []);

  const loadDocuments = async (campaignId: number, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const docs = await api.knowledgeBase.list(campaignId);
      setDocuments(docs);
    } catch { setDocuments([]); }
    finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedCampaignId) {
      loadDocuments(selectedCampaignId);
      setSearchResults(null);
      setSearchQuery('');
    } else {
      setDocuments([]);
      setLoading(false);
    }
  }, [selectedCampaignId]);

  const handleSearch = async () => {
    if (!selectedCampaignId || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await api.knowledgeBase.search(selectedCampaignId, searchQuery);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
  };

  const openCreateModal = () => {
    setEditingDoc(null);
    setFormTitle('');
    setFormContent('');
    setShowModal(true);
  };

  const openEditModal = (doc: KnowledgeDocument) => {
    setEditingDoc(doc);
    setFormTitle(doc.title);
    setFormContent(doc.content);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      setMessage({ type: 'error', text: 'Title and content are required' });
      return;
    }
    if (!selectedCampaignId) return;
    setSaving(true);
    try {
      if (editingDoc) {
        await api.knowledgeBase.update(editingDoc.id, { title: formTitle, content: formContent });
        setMessage({ type: 'success', text: 'Document updated' });
      } else {
        await api.knowledgeBase.create({ campaign_id: selectedCampaignId, title: formTitle, content: formContent });
        setMessage({ type: 'success', text: 'Document created' });
      }
      setShowModal(false);
      loadDocuments(selectedCampaignId);
    } catch {
      setMessage({ type: 'error', text: 'Failed to save document' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDelete = async (doc: KnowledgeDocument) => {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    try {
      await api.knowledgeBase.delete(doc.id);
      setMessage({ type: 'success', text: 'Document deleted' });
      loadDocuments(selectedCampaignId!);
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const displayedDocs = searchResults !== null ? searchResults : documents;

  return (
    <ProtectedRoute>
      <MainLayout title="Knowledge Base" breadcrumbs={[{ label: 'Knowledge Base' }]}>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen size={28} className="text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Knowledge Base</h1>
                <p className="text-muted-foreground mt-1">Store documents your AI agent can reference during calls</p>
              </div>
            </div>
          </div>

          {/* Campaign selector */}
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedCampaignId ?? ''}
                onChange={(e) => setSelectedCampaignId(e.target.value ? parseInt(e.target.value) : null)}
                className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30"
              >
                <option value="">Select a campaign...</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {selectedCampaignId && (
                <>
                  <div className="relative flex-1 min-w-[200px]">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text" placeholder="Search documents..."
                      value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <button onClick={handleSearch}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2.5 text-white text-sm transition-all-smooth">
                    <Search size={16} /> Search
                  </button>
                  <button onClick={() => { if (selectedCampaignId) loadDocuments(selectedCampaignId, true); }} disabled={refreshing}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2.5 text-white text-sm transition-all-smooth disabled:opacity-40">
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                  </button>
                  <button onClick={openCreateModal}
                    className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors">
                    <Plus size={16} /> Add Document
                  </button>
                </>
              )}
            </div>
          </Card>

          {/* Documents list */}
          {selectedCampaignId ? (
            <>
              {searchResults !== null && (
                <p className="text-sm text-gray-400">
                  Search results for "{searchQuery}" — {searchResults.length} found
                  {searchResults.length > 0 && (
                    <button onClick={() => setSearchResults(null)} className="ml-2 text-primary hover:underline">Clear</button>
                  )}
                </p>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader size={24} className="animate-spin text-gray-400" />
                </div>
              ) : displayedDocs.length === 0 ? (
                <Card>
                  <div className="text-center py-12">
                    <FileText size={48} className="mx-auto text-gray-600 mb-4" />
                    <p className="text-gray-400">No knowledge documents yet.</p>
                    <p className="text-sm text-gray-600 mt-1">Add documents with scripts, FAQs, product info, or guidelines.</p>
                    <button onClick={openCreateModal}
                      className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
                      <Plus size={16} /> Create First Document
                    </button>
                  </div>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {displayedDocs.map((doc) => (
                    <Card key={doc.id}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <FileText size={20} className="text-primary flex-shrink-0 mt-1" />
                          <div className="min-w-0 flex-1">
                            <h3 className="text-white font-semibold truncate">{doc.title}</h3>
                            <p className="text-gray-500 text-xs mt-1">
                              {doc.content.length > 200 ? doc.content.substring(0, 200) + '...' : doc.content}
                            </p>
                            <p className="text-gray-600 text-xs mt-2">
                              Created {new Date(doc.created_at).toLocaleDateString()}
                              {doc.updated_at !== doc.created_at && ` · Updated ${new Date(doc.updated_at).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => openEditModal(doc)}
                            className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center" title="Edit">
                            <Edit2 size={14} className="text-gray-400" />
                          </button>
                          <button onClick={() => handleDelete(doc)}
                            className="w-8 h-8 bg-red-500/20 hover:bg-red-500/40 rounded-lg flex items-center justify-center" title="Delete">
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Card>
              <div className="text-center py-12">
                <BookOpen size={48} className="mx-auto text-gray-600 mb-4" />
                <p className="text-gray-400">Select a campaign above to manage its knowledge base.</p>
                <p className="text-sm text-gray-600 mt-1">Documents are loaded by the AI agent during calls for that campaign.</p>
              </div>
            </Card>
          )}

          {/* Create/Edit Modal */}
          {showModal && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
              <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <FileText size={20} className="text-primary" />
                    <h2 className="text-xl font-bold text-white">{editingDoc ? 'Edit Document' : 'New Document'}</h2>
                  </div>
                  <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-lg">
                    <X size={20} className="text-gray-400" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Title</label>
                    <input type="text" value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="e.g. Final Expense Script v2.1"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Content</label>
                    <p className="text-xs text-gray-500 mb-2">
                      This content is injected into the AI agent&apos;s system prompt during calls. 
                      Include scripts, FAQs, product info, objection handling, or any reference material.
                    </p>
                    <textarea
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                      placeholder={`Paste your script, FAQ, or reference material here...\n\nThe AI agent will use this during calls for this campaign.`}
                      rows={16}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-white/30 resize-y"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setShowModal(false)}
                      className="px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white font-medium transition-all-smooth">
                      Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                      {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                      {editingDoc ? 'Update' : 'Create'}
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Toast */}
          {message && (
            <div className={`fixed bottom-6 right-6 px-6 py-3 rounded-lg text-sm font-medium z-50 ${
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
