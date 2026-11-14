import{validateReviewRow}from'./review-schema.mjs';
export const REVIEW_QUEUE_STORAGE_KEY='jp-tutor.review-outbox.v1';
const MAX_ITEMS=500;
// Browser localStorage mount for the offline unsent review queue. Owner device
// only: no network, no analytics, and rows carry no audio/transcript/pseudonym.
// Storage interface is injected ({getItem,setItem,removeItem}) so tests need no
// browser. Corrupt or tampered payloads are never used: the raw text moves to a
// quarantine key for owner inspection and the live key is cleared.
function validQueue(data){return Array.isArray(data)&&data.length<=MAX_ITEMS&&data.every(item=>{try{return typeof item?.reviewId==='string'&&item.reviewId===item.row?.[0]&&validateReviewRow(item.row)===item.row}catch{return false}})}
export function loadReviewQueue(storage,key=REVIEW_QUEUE_STORAGE_KEY){
 const text=storage.getItem(key);if(text==null)return[];
 let data;try{data=JSON.parse(text)}catch{data=null}
 if(!validQueue(data)){try{storage.setItem(key+'.quarantine',String(text))}catch{}storage.removeItem(key);return[]}
 return data.map(item=>({reviewId:item.reviewId,row:structuredClone(item.row)}));
}
export function saveReviewQueue(storage,queue,key=REVIEW_QUEUE_STORAGE_KEY){
 if(!validQueue(queue))throw Error('Invalid review queue');
 if(queue.length===0){storage.removeItem(key);return[]}
 storage.setItem(key,JSON.stringify(queue));return queue;
}
