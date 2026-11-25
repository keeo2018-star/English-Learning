'use client';
import {useEffect} from 'react';
import {offlineIdentity} from '@/lib/offline-library';
import {pendingReviews} from '@/lib/offline-store';
import {syncOfflineReviews} from '@/lib/offline-sync';
// Foreground retry works on Safari/PWA without assuming Background Sync support.
export function OfflineReviewSync(){useEffect(()=>{let active=true,busy=false;
 const sync=async()=>{if(!active||busy||!navigator.onLine||document.visibilityState!=='visible')return;const owner=offlineIdentity()?.id;if(!owner)return;busy=true;try{if((await pendingReviews(owner)).length){await syncOfflineReviews(owner);if(active)window.dispatchEvent(new CustomEvent('noted-reviews-synced',{detail:owner}));}}catch{/* The durable owner queue remains available for a later foreground retry. */}finally{busy=false;}};
 void sync();window.addEventListener('online',sync);window.addEventListener('focus',sync);document.addEventListener('visibilitychange',sync);const timer=setInterval(sync,30000);
 return()=>{active=false;clearInterval(timer);window.removeEventListener('online',sync);window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync);};
},[]);return null;}
