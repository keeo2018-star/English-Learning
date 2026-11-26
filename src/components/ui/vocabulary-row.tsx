import Link from 'next/link';
import type { Ref } from 'react';
import { Icon } from './icon';

export function VocabularyRow({ expression, meaning, metadata, href, onClick, buttonRef }: {
  expression:string; meaning:string; metadata?:string; href?:string; onClick?:()=>void; buttonRef?:Ref<HTMLButtonElement>;
}) {
  const copy = <><span className="wb-vocabulary-copy"><strong><span role="heading" aria-level={2}>{expression}</span></strong>
    {meaning && <span>{meaning}</span>}{metadata && <small>{metadata}</small>}</span><Icon name="chevronRight" size={16}/></>;
  return href ? <Link className="wb-vocabulary-row" href={href}>{copy}</Link> :
    <button className="wb-vocabulary-row" type="button" ref={buttonRef} aria-haspopup="dialog" aria-label={'Dictionary for ' + expression} onClick={onClick}>{copy}</button>;
}
