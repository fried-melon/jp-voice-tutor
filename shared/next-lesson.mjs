// Next-lesson suggestion from ACTUAL completed-session metadata (preview).
// Completion records order a suggestion; completion is NOT mastery or progress proof.
export function suggestNextLesson(sessionSummaries,lessons){
 if(!Array.isArray(lessons)||lessons.length===0)return null;
 const completed=(sessionSummaries||[]).filter(s=>s&&s.end_state==='duration_complete'&&typeof s.lesson_id==='string');
 if(completed.length===0)return{lesson:lessons[0],basis:'no_completed_sessions'};
 const latest=completed.sort((a,b)=>String(b.started_at).localeCompare(String(a.started_at)))[0];
 const idx=lessons.findIndex(l=>l.id===latest.lesson_id);
 if(idx<0)return{lesson:lessons[0],basis:'completed_lesson_not_in_current_content'};
 if(idx+1<lessons.length)return{lesson:lessons[idx+1],basis:'after_completed:'+latest.lesson_id};
 return{lesson:lessons[idx],basis:'last_lesson_completed'};
}
