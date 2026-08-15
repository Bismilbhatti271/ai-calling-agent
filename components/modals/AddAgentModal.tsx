'use client';

import { useState, useEffect } from 'react';
import { X, Volume2, Loader } from 'lucide-react';
import { Card } from '@/components/common/Card';

interface Voice {
  name: string;
  friendly_name: string;
  gender: string;
  locale: string;
}

interface AddAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (agentData: any) => void;
}

const TTS_API = process.env.NEXT_PUBLIC_LIVE_API_BASE || 'http://localhost:8000';

export function AddAgentModal({ isOpen, onClose, onSubmit }: AddAgentModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    model: 'llama-3.1-8b-instant',
    voice_type: 'en-US-GuyNeural',
  });
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoadingVoices(true);
      fetch(`${TTS_API}/voices`)
        .then(r => r.json())
        .then(data => {
          if (data.voices) setVoices(data.voices);
        })
        .catch(() => {})
        .finally(() => setLoadingVoices(false));
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.description.trim()) {
      alert('Please fill in both name and description.');
      return;
    }
    try {
      await onSubmit(formData);
      setFormData({ name: '', description: '', model: 'llama-3.1-8b-instant', voice_type: 'en-US-GuyNeural' });
      onClose();
    } catch (err: any) {
      alert('Failed to create agent: ' + (err.message || 'Unknown error'));
    }
  };

  const handlePreviewVoice = async () => {
    if (!formData.voice_type) return;
    setPreviewing(true);
    try {
      const text = `Hi there, this is ${formData.name || 'your agent'}. How are you doing today?`;
      const resp = await fetch(`${TTS_API}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: formData.voice_type }),
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play();
      }
    } catch {}
    setPreviewing(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Create New Agent</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Agent Name</label>
            <input type="text" value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Jimmy Anderson"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
            />
            <p className="text-xs text-gray-500 mt-1">The agent will introduce themselves with this name during calls.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
            <textarea value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this agent does..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 min-h-[80px]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
            <select value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30"
            >
              <option value="llama-3.1-8b-instant">Llama 3.1 8B (Fast)</option>
              <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
              <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Voice</label>
            <div className="flex gap-2">
              <select value={formData.voice_type}
                onChange={(e) => setFormData({ ...formData, voice_type: e.target.value })}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30"
              >
                {loadingVoices ? (
                  <option>Loading voices...</option>
                ) : voices.length === 0 ? (
                  <>
                    <option value="en-US-GuyNeural">Guy (Default)</option>
                    <option value="en-US-JennyNeural">Jenny</option>
                    <option value="en-US-AriaNeural">Aria</option>
                    <option value="en-US-DavisNeural">Davis</option>
                    <option value="en-US-JaneNeural">Jane</option>
                    <option value="en-US-JasonNeural">Jason</option>
                    <option value="en-US-NancyNeural">Nancy</option>
                    <option value="en-US-SaraNeural">Sara</option>
                    <option value="en-US-TonyNeural">Tony</option>
                    <option value="en-US-AmberNeural">Amber</option>
                    <option value="en-US-AnaNeural">Ana</option>
                    <option value="en-US-AshleyNeural">Ashley</option>
                    <option value="en-US-BrandonNeural">Brandon</option>
                    <option value="en-US-ChristopherNeural">Christopher</option>
                    <option value="en-US-CoraNeural">Cora</option>
                    <option value="en-US-ElizabethNeural">Elizabeth</option>
                    <option value="en-US-EricNeural">Eric</option>
                    <option value="en-US-JacobNeural">Jacob</option>
                    <option value="en-US-MichelleNeural">Michelle</option>
                    <option value="en-US-MonicaNeural">Monica</option>
                    <option value="en-US-RogerNeural">Roger</option>
                    <option value="en-US-SteffanNeural">Steffan</option>
                    <option value="en-US-ThomasNeural">Thomas</option>
                  </>
                ) : (
                  voices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.friendly_name} ({v.gender})
                    </option>
                  ))
                )}
              </select>
              <button type="button" onClick={handlePreviewVoice} disabled={previewing}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm transition-all-smooth disabled:opacity-40"
                title="Preview voice">
                {previewing ? <Loader size={16} className="animate-spin" /> : <Volume2 size={16} />}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-medium transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2.5 bg-white/20 hover:bg-white/30 border border-white/30 rounded-lg text-white font-medium transition-colors">
              Create Agent
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
