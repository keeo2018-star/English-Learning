'use client';

import type {ReactNode} from 'react';
import {PageHeader} from '@/components/ui/page-header';
import {LanguagePicker,type LanguageOption} from '@/components/ui/language-picker';
import {learningLanguages,type LearningCollection} from '@/lib/collections';

export function collectionLanguageOptions(collections:LearningCollection[]):LanguageOption[] {
  return collections.map(row=>({
    id:row.id, language:row.target_language, label:learningLanguages[row.target_language].label,
    description:collections.some(other=>other.id!==row.id&&other.target_language===row.target_language)
      ? `${row.explanation_language==='en'?'English':'Chinese'} explanations` : undefined,
  }));
}

export function LearningHeader({title,legacyTitle=title,enabled=false,collections=[],active,onSelect,disabled=false,brand=false}:{
  title:ReactNode;legacyTitle?:ReactNode;enabled?:boolean;collections?:LearningCollection[];active?:LearningCollection|null;
  onSelect?:(id:string)=>void;disabled?:boolean;brand?:boolean;
}){
  return <PageHeader title={enabled?title:legacyTitle} brand={brand}>
    {enabled&&active&&collections.length>1&&onSelect&&<LanguagePicker
      options={collectionLanguageOptions(collections)} value={active.id} label="Switch learning Collection" onSelect={onSelect} disabled={disabled}/>}
  </PageHeader>;
}
