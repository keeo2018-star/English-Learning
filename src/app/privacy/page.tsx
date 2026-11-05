import Link from 'next/link';
import { AppShell } from '@/components/ui/app-shell';
export default function Privacy() {
  return <AppShell active={null}><article style={{ maxWidth: 720, margin: '0 auto', lineHeight: 1.8 }}>
    <h1>Privacy & terms</h1>
    <p>Noted stores your account and saved learning items with Supabase. Your library and review activity belong to your signed-in account.</p>
    <h2>Optional video examples</h2>
    <p>In the Wild uses the official YouGlish widget and YouTube player. No video service is loaded until you agree and load a video. You can keep using Noted without loading videos. Close the video section to remove the player; closing it does not erase information already processed by the providers.</p>
    <p>When you load videos, these providers receive connection information such as your IP address, device/browser details and the English text being searched. They may store or access cookies and other device information under their own policies. Do not search sensitive personal information.</p>
    <p>By using the video feature, you agree to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a> and <a href="https://youglish.com/terms" target="_blank" rel="noopener noreferrer">YouGlish terms and privacy policy</a>. Google’s handling of information is described in the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>.</p>
    <p>Video results are supplied by YouGlish. Noted does not independently verify spoken matches, download videos, or store provider transcripts. Availability and provider limits may change.</p>
    <Link className="wb-control wb-control-outline" href="/">Back to Noted</Link>
  </article></AppShell>;
}
