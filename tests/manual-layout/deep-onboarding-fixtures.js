/* Memory-only Welcome review. Registering cases never reads or changes Lumo.
   The isolated gallery supplies disposable storage/history before prepare. */
(()=>{
'use strict';
function welcome({fresh=false,closed=false,locked=false}={}){
 if(fresh)L.reset();else L.explore();
 L.state.closed=closed;
 L.state.locked=locked;
 if(closed)L.state.closure={id:'QA-CLOSED-WELCOME',status:'Closed',date:'27 Oct 2026, 12:00'};
 L.save();L.go('welcome');L.render();
}
window.__deepScenarioGroups=window.__deepScenarioGroups||{};
window.__deepScenarioGroups.onboarding=[
 {id:'welcome-fresh',route:'welcome',name:'Fresh account · Get started',prepare(){welcome({fresh:true});}},
 {id:'welcome-locked',route:'welcome',name:'Existing signed-out account · Sign in',prepare(){welcome({locked:true});}},
 {id:'welcome-closed-open',route:'welcome',name:'Closed account · saved records',prepare(){welcome({closed:true});}},
 {id:'welcome-closed-locked',route:'welcome',name:'Closed signed-out account · guarded records',prepare(){welcome({closed:true,locked:true});}}
];
})();
