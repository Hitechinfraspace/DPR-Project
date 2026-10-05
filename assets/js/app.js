(() => {
      "use strict";
      const STORAGE_KEY = "dpr-complete-v1";
      const SUPABASE_URL = "https://ootxvupcrxddkdixvupf.supabase.co";
      const SUPABASE_ANON_KEY = "sb_publishable_MIBBi3NA24PscC51W6fTlQ_NI1yplw5";
      const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const DEFAULT_LABELS = {project:"Project",date:"Report date",weather:"Weather",shift:"Shift",number:"Sl. No.",landmark:"Landmark / location",contractor:"Sub-contractor",quantity:"No. of pipes",length:"Length / pipe (m)",remarks:"Remarks / status"};
      const DEFAULT_COLUMN_ORDER=["number","landmark","contractor","quantity","length","remarks"];
      const DEFAULT_CONFIG = {projects:["Water Supply Phase 2"],contractors:["Sub-Contractor A","Sub-Contractor B"],weather:["Clear","Cloudy","Rain"],shifts:["Day","Night"],labels:{...DEFAULT_LABELS},customFields:[],columnOrder:DEFAULT_COLUMN_ORDER,hiddenColumns:[]};
      const todayISO = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; };
      const makeId = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const $ = (selector, root=document) => root.querySelector(selector);
      const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
      const text = (value) => typeof value === "string" ? value : "";
      const clone = (value) => JSON.parse(JSON.stringify(value));
      const freshRow = () => ({id:makeId(),landmark:"",contractor:"",quantity:"",length:"",remarks:"",custom:{}});
      const freshReport = () => ({project:"",weather:"",shift:"",submittedBy:"",designation:"",signature:"",rows:[freshRow()]});
      function normalizedConfig(value={}) {
        const cfg = {...clone(DEFAULT_CONFIG),...(value || {})};
        ["projects","contractors","weather","shifts"].forEach(key => { cfg[key] = Array.isArray(cfg[key]) ? cfg[key].filter(item => typeof item === "string" && item.trim()).map(item => item.trim()) : clone(DEFAULT_CONFIG[key]); });
        delete cfg.landmarks;
        delete cfg.pipes;
        delete cfg.fittings;
        cfg.labels = Object.fromEntries(Object.entries(DEFAULT_LABELS).map(([key,label])=>[key,typeof value?.labels?.[key]==="string"?value.labels[key]:label]));
        cfg.customFields = Array.isArray(cfg.customFields) ? cfg.customFields.filter(field => field && typeof field.name === "string").map(field => ({id:text(field.id) || makeId(),name:field.name.trim(),type:["text","number","dropdown"].includes(field.type) ? field.type : "text",options:Array.isArray(field.options) ? field.options.filter(option => typeof option === "string") : []})).filter(field => field.name) : [];
        delete cfg.equations;
        delete cfg.totalEquationId;
        delete cfg.formula;
        delete cfg.formulaVariableNames;
        delete cfg.formulaVariableBindings;
        const availableColumns=[...DEFAULT_COLUMN_ORDER,...cfg.customFields.map(field=>`custom:${field.id}`)];
        const savedOrder=Array.isArray(value?.columnOrder) ? value.columnOrder.filter(key=>availableColumns.includes(key) && key!=="number") : [];
        cfg.columnOrder=[...new Set(["number",...savedOrder,...availableColumns.filter(key=>key!=="number")])];
        cfg.hiddenColumns=Array.isArray(value?.hiddenColumns) ? [...new Set(value.hiddenColumns.filter(key=>availableColumns.includes(key) && key!=="number"))] : [];
        cfg.removedColumns=Array.isArray(value?.removedColumns) ? [...new Set(value.removedColumns.filter(key=>availableColumns.includes(key) && key!=="number"))] : [];
        return cfg;
      }
      function normalizedReport(value={}) {
        const source = value && typeof value === "object" ? value : {};
        const rows = Array.isArray(source.rows) ? source.rows.map(row => ({id:text(row?.id) || makeId(),landmark:text(row?.landmark),contractor:text(row?.contractor),quantity:text(row?.quantity),length:text(row?.length),remarks:text(row?.remarks),custom:row?.custom && typeof row.custom === "object" ? row.custom : {}})) : [];
        return {...freshReport(),...source,project:text(source.project),weather:text(source.weather),shift:text(source.shift),submittedBy:text(source.submittedBy),designation:text(source.designation),signature:text(source.signature),rows:rows.length ? rows : [freshRow()]};
      }
      function normalizeTemplates(templates) {
        if(!Array.isArray(templates))return [];
        const ids=new Set();
        return templates.filter(item=>item && typeof item.name==="string" && item.config && typeof item.config==="object").map(item=>({id:text(item.id)||makeId(),name:item.name.trim().slice(0,80),config:normalizedConfig(item.config)})).filter(item=>item.name && !ids.has(item.id) && ids.add(item.id));
      }
      function fromSupabaseTemplate(template) {
        let content=template.content;
        if(typeof content==="string")content=JSON.parse(content);
        return {id:String(template.id),name:template.title,config:normalizedConfig(content)};
      }
      async function saveTemplate(title, content) {
        const {data,error}=await supabaseClient.from("templates").insert({title,content}).select().single();
        if(error){console.error("Could not save template to Supabase.",error);throw new Error(error.message || "Could not save template.");}
        return data;
      }
      async function loadTemplates() {
        try {
          const activeName=state.templates.find(template=>template.id===state.activeTemplateId)?.name;
          const {data,error}=await supabaseClient.from("templates").select("*").order("created_at",{ascending:false});
          if(error)throw error;
          const saved=data || [];
          const names=new Set(saved.map(template=>template.title.toLocaleLowerCase()));
          for(const template of state.templates) {
            const databaseId=Number.isSafeInteger(Number(template.id)) && Number(template.id)>0;
            const name=template.name.toLocaleLowerCase();
            if(databaseId || names.has(name))continue;
            const created=await saveTemplate(template.name,template.config);
            saved.push(created);names.add(name);
          }
          state.templates=saved.map(fromSupabaseTemplate);
          if(!state.templates.some(template=>template.id===state.activeTemplateId))state.activeTemplateId=state.templates.find(template=>template.name===activeName)?.id || "";
          renderHeaderTemplatePicker();renderTemplateLibrary();persist("Templates loaded from Supabase");
          return state.templates;
        } catch(error) {
          $("#save-label").textContent="Supabase unavailable";
          console.error("Could not load templates from Supabase.",error);
          return [];
        }
      }
      async function updateSupabaseTemplate(id,title,content) {
        const {data,error}=await supabaseClient.from("templates").update({title,content}).eq("id",id).select().single();
        if(error){console.error("Could not update template in Supabase.",error);throw new Error(error.message || "Could not update template.");}
        return data;
      }
      async function deleteSupabaseTemplate(id) {
        const {error}=await supabaseClient.from("templates").delete().eq("id",id);
        if(error){console.error("Could not delete template from Supabase.",error);throw new Error(error.message || "Could not delete template.");}
      }
      function readState() {
        try {
          const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
          const templates=normalizeTemplates(stored?.templates);
          const activeTemplateId=templates.some(item=>item.id===stored?.activeTemplateId)?stored.activeTemplateId:"";
          return {config:normalizedConfig(stored?.config),reports:stored?.reports&&typeof stored.reports==="object"?stored.reports:{},templates,activeTemplateId};
        } catch { return {config:clone(DEFAULT_CONFIG),reports:{},templates:[],activeTemplateId:""}; }
      }
      let state = readState();
      let activeDate = todayISO();
      let report = normalizedReport(state.reports[activeDate]);
      const dialog = $("#manager-dialog");

      function persist(message="Saved locally") {
        state.reports[activeDate] = report;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); $("#save-label").textContent = message; }
        catch { $("#save-label").textContent = "Local storage unavailable"; }
      }
      function make(tag, props={}, value="") {
        const node = document.createElement(tag);
        Object.entries(props).forEach(([key,val]) => { if (key.startsWith("data-")) node.setAttribute(key,val); else if (key === "className") node.className=val; else if (key === "aria-label" || key === "title") node.setAttribute(key,val); else node[key]=val; });
        if (value !== "") node.textContent=value;
        return node;
      }
      function appendOptions(select, options, selected, placeholder="Choose…") {
        select.replaceChildren();
        select.append(make("option",{value:""},placeholder));
        [...new Set(options.filter(Boolean))].forEach(option => select.append(make("option",{value:option},option)));
        if (selected && !options.includes(selected)) select.append(make("option",{value:selected},selected));
        select.value=selected || "";
      }
      function selectControl(key, options, selected, label) {
        const select=make("select",{"data-key":key,"aria-label":label});
        appendOptions(select,options,selected);
        return select;
      }
      function fieldControl(key,value,label,type="text",readonly=false) {
        const input=make("input",{type,value:text(value),"data-key":key,"aria-label":label});
        if (readonly) input.readOnly=true;
        if (type === "number") { input.min="0"; input.step="any"; }
        return input;
      }
      function number(value) { const parsed=Number.parseFloat(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : 0; }
      function fmt(value) { return new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(value); }
      function renderHeaderTemplatePicker() {
        const select=$("#header-template");select.replaceChildren(make("option",{value:""},"Choose template"));
        state.templates.forEach(template=>select.append(make("option",{value:template.id},template.name)));
        select.value=state.templates.some(template=>template.id===state.activeTemplateId)?state.activeTemplateId:"";
        select.disabled=state.templates.length===0;
      }
      function renderHeader() {
        renderHeaderTemplatePicker();
        const config=state.config;
        appendOptions($("#project-select"),config.projects,report.project,"Select project");
        appendOptions($("#weather-select"),config.weather,report.weather,"Select weather");
        appendOptions($("#shift-select"),config.shifts,report.shift,"Select shift");
        Object.entries({project:"project",date:"date",weather:"weather",shift:"shift"}).forEach(([key,id]) => $(`#label-${id}`).textContent=config.labels[key]);
        $("#report-date").value=activeDate;
        const [year,month,day]=activeDate.split("-").map(Number);
        $("#date-summary").textContent=new Date(year,month-1,day).toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"});
        $("#submitted-by").value=report.submittedBy;
        $("#designation").value=report.designation;
        $("#signature").value=report.signature;
      }
      const columns = [
        {key:"number",labelKey:"number",className:"col-no"},
        {key:"landmark",labelKey:"landmark",className:"col-landmark"},
        {key:"contractor",labelKey:"contractor",className:"col-contractor"},
        {key:"quantity",labelKey:"quantity",className:"col-qty"},
        {key:"length",labelKey:"length",className:"col-length"},
        {key:"remarks",labelKey:"remarks",className:"col-remarks"}
      ];
      function columnCatalog() {
        return [...columns.map(column=>({...column,label:column.labelKey ? state.config.labels[column.labelKey] : column.label})),...state.config.customFields.map(field=>({key:`custom:${field.id}`,label:field.name,className:"custom-col"}))];
      }
      function orderedColumnCatalog() {
        const catalog=columnCatalog().filter(column=>column.key==="number" || !state.config.removedColumns.includes(column.key));const byKey=new Map(catalog.map(column=>[column.key,column]));
        const keys=["number",...state.config.columnOrder.filter(key=>key!=="number" && byKey.has(key)),...catalog.map(column=>column.key).filter(key=>key!=="number" && !state.config.columnOrder.includes(key))];
        return keys.map(key=>byKey.get(key));
      }
      function applyColumnLayout() {
        const order=orderedColumnCatalog().map(column=>column.key);const hidden=new Set(state.config.hiddenColumns.filter(key=>key!=="number"));
        const arrange=row=>{const cells=[...row.children];const action=cells.find(cell=>cell.classList.contains("col-action"));const byKey=new Map(cells.filter(cell=>cell.dataset.columnKey).map(cell=>[cell.dataset.columnKey,cell]));const ordered=order.map(key=>byKey.get(key)).filter(Boolean);ordered.forEach(cell=>{cell.hidden=cell.dataset.columnKey!=="number" && hidden.has(cell.dataset.columnKey);});row.replaceChildren(...ordered,...(action?[action]:[]));};
        arrange($("#work-head"));$$("#work-rows tr").forEach(arrange);
      }
      function renderWorkLog() {
        const header=$("#work-head");
        header.replaceChildren();
        columnCatalog().forEach(column => header.append(make("th",{scope:"col",className:column.className,"data-column-key":column.key},column.label)));
        header.append(make("th",{scope:"col",className:"col-action no-print","aria-label":"Actions"}));
        const body=$("#work-rows"); body.replaceChildren();
        report.rows.forEach((row,index) => {
          const tr=make("tr"); tr.dataset.rowId=row.id;
          tr.append(make("td",{className:"col-no","data-column-key":"number"},String(index+1)));
          let cell=make("td",{className:"col-landmark","data-column-key":"landmark"});cell.append(fieldControl("landmark",row.landmark,state.config.labels.landmark));tr.append(cell);
          cell=make("td",{className:"col-contractor","data-column-key":"contractor"});cell.append(selectControl("contractor",state.config.contractors,row.contractor,state.config.labels.contractor));tr.append(cell);
          cell=make("td",{className:"col-qty","data-column-key":"quantity"});cell.append(fieldControl("quantity",row.quantity,state.config.labels.quantity,"number"));tr.append(cell);
          cell=make("td",{className:"col-length","data-column-key":"length"});cell.append(fieldControl("length",row.length,state.config.labels.length,"number"));tr.append(cell);
          cell=make("td",{className:"col-remarks","data-column-key":"remarks"});cell.append(fieldControl("remarks",row.remarks,state.config.labels.remarks));tr.append(cell);
          state.config.customFields.forEach(field => {
            cell=make("td",{className:"custom-col","data-column-key":`custom:${field.id}`});
            if (field.type === "dropdown") cell.append(selectControl(`custom:${field.id}`,field.options,row.custom[field.id] || "",field.name));
            else cell.append(fieldControl(`custom:${field.id}`,row.custom[field.id] || "",field.name,field.type === "number" ? "number" : "text"));
            tr.append(cell);
          });
          cell=make("td",{className:"col-action no-print"});
          const remove=make("button",{type:"button",className:"icon-button","data-remove-row":row.id,title:"Remove row","aria-label":"Remove work row"});
          remove.innerHTML='<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 4.5h10M6 4.5V3h4v1.5m-5.5 0 .6 8.5h5.8l.6-8.5M6.5 7v3.8m3-3.8v3.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          cell.append(remove);tr.append(cell);body.append(tr);
        });
        applyColumnLayout();
        updateTotals();
      }
      function updateTotals() {
        const pipes=report.rows.reduce((sum,row)=>sum+number(row.quantity),0);
        $("#stat-rows").textContent=String(report.rows.length);
        $("#stat-pipes").textContent=fmt(pipes);
        $("#total-pipes").textContent=fmt(pipes);
      }
      function renderTemplateLibrary(selectedId=state.activeTemplateId) {
        const select=$("#template-select");select.replaceChildren(make("option",{value:""},"Choose a saved template"));
        state.templates.forEach(template=>select.append(make("option",{value:template.id},template.name)));
        select.value=state.templates.some(template=>template.id===selectedId)?selectedId:"";
        const selected=state.templates.find(template=>template.id===select.value);
        if(document.activeElement!==$("#template-name"))$("#template-name").value=selected?.name || "";
        $("#load-template").disabled=!selected;
        $("#update-template").disabled=!selected || selected.id!==state.activeTemplateId;
        $("#delete-template").disabled=!selected;
        $("#save-config").textContent=state.activeTemplateId?"Apply & update active template":"Apply changes";
        renderHeaderTemplatePicker();
      }
      function renderManager() {
        renderTemplateLibrary();
        $$('[data-list]').forEach(area=>area.value=state.config[area.dataset.list].join("\n"));
        const labelConfig=$("#label-config");labelConfig.replaceChildren();
        Object.keys(DEFAULT_LABELS).forEach(key=>{const wrap=make("div",{className:"field"});const input=make("input",{type:"text",value:state.config.labels[key],"data-label-key":key,"aria-label":`Heading for ${key}`});const label=make("label",{},key.replace(/[A-Z]/g,char=>` ${char.toLowerCase()}`));wrap.append(label,input);labelConfig.append(wrap);});
        renderColumnManager();
        renderCustomManager();
      }
      function renderCustomManager() {
        const container=$("#custom-config");container.replaceChildren();
        state.config.customFields.forEach((field,index)=>{
          const row=make("div",{className:"custom-config-row","data-custom-config":String(index)});
          row.append(make("input",{type:"text",value:field.name,"data-custom-prop":"name","aria-label":"Custom field name",placeholder:"Column heading"}));
          const type=make("select",{"data-custom-prop":"type","aria-label":"Custom field type"});[["text","Text"],["number","Number"],["dropdown","Dropdown"]].forEach(([value,label])=>type.append(make("option",{value},label)));type.value=field.type;row.append(type);
          row.append(make("input",{type:"text",value:field.options.join(", "),"data-custom-prop":"options","aria-label":"Dropdown options","placeholder":"Option A, Option B"}));
          row.append(make("button",{type:"button",className:"icon-button","data-remove-custom":String(index),"aria-label":"Remove custom field",title:"Remove"},"×"));container.append(row);
        });
      }

      function renderColumnManager() {
        const container=$("#column-config");container.replaceChildren();
        orderedColumnCatalog().forEach(column=>{
          const row=make("div",{className:"column-config-row","data-column-config":column.key});
          let displayName=column.label;
          if(column.key.startsWith("custom:")){const field=state.config.customFields.find(item=>`custom:${item.id}`===column.key);const index=state.config.customFields.indexOf(field);const draft=field?$(`[data-custom-config="${index}"] [data-custom-prop="name"]`)?.value.trim():"";displayName=draft||field?.name||"New custom column";}
          const serialColumn=column.key==="number";
          const label=make("label");const checkbox=make("input",{type:"checkbox","data-column-visible":column.key,"aria-label":`Show ${displayName}`});checkbox.checked=serialColumn || !state.config.hiddenColumns.includes(column.key);checkbox.disabled=serialColumn;label.append(checkbox,document.createTextNode(displayName));row.append(label);
          const moveLeft=make("button",{type:"button",className:"icon-button","data-move-column":"up",title:"Move left","aria-label":`Move ${column.label} left`},"↑");moveLeft.disabled=serialColumn;row.append(moveLeft);
          const moveRight=make("button",{type:"button",className:"icon-button","data-move-column":"down",title:"Move right","aria-label":`Move ${column.label} right`},"↓");moveRight.disabled=serialColumn;row.append(moveRight);
          const remove=make("button",{type:"button",className:"icon-button","data-remove-column":column.key,title:"Remove from template","aria-label":`Remove ${column.label} from this template`},"×");remove.disabled=serialColumn;row.append(remove);container.append(row);
        });
        const restoreSelect=$("#restore-column");
        restoreSelect.replaceChildren(make("option",{value:""},"Choose a removed column"));
        const removed=new Set(state.config.removedColumns);
        columnCatalog().filter(column=>column.key!=="number" && removed.has(column.key)).forEach(column=>restoreSelect.append(make("option",{value:column.key},column.label)));
        $("#restore-column-button").disabled=removed.size===0;
      }
      function applyManager(options={}) {
        $$('[data-list]').forEach(area=>{state.config[area.dataset.list]=[...new Set(area.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean))];});
        $$("[data-label-key]").forEach(input=>{state.config.labels[input.dataset.labelKey]=input.value.trim() || DEFAULT_LABELS[input.dataset.labelKey];});
        state.config.customFields=$$("[data-custom-config]").map(row=>({id:state.config.customFields[Number(row.dataset.customConfig)]?.id || makeId(),name:$('[data-custom-prop="name"]',row).value.trim(),type:$('[data-custom-prop="type"]',row).value,options:$('[data-custom-prop="options"]',row).value.split(",").map(item=>item.trim()).filter(Boolean)})).filter(field=>field.name);
        const available=new Set(columnCatalog().map(column=>column.key));
        const requested=$$("#column-config [data-column-config]").map(row=>row.dataset.columnConfig).filter(key=>available.has(key) && key!=="number");
        state.config.removedColumns=state.config.removedColumns.filter(key=>available.has(key) && key!=="number");
        state.config.columnOrder=[...new Set(["number",...requested,...available])];
        state.config.hiddenColumns=$$("#column-config [data-column-visible]").filter(input=>!input.checked && available.has(input.dataset.columnVisible) && input.dataset.columnVisible!=="number").map(input=>input.dataset.columnVisible);
        if(options.updateTemplate!==false){const activeTemplate=state.templates.find(template=>template.id===state.activeTemplateId);if(activeTemplate)activeTemplate.config=clone(state.config);}
        renderHeader();renderWorkLog();persist();return true;
      }
      function filename(extension) { const project=(report.project || "daily-progress-report").replace(/[^a-z0-9-_]+/gi,"-").replace(/^-|-$/g,"").toLowerCase();return `${project}-${activeDate}.${extension}`; }
            function loadDemoTemplate() {
              if(!confirm("Load the demo template? It replaces the current template and this date's report. Other dates remain unchanged."))return;
              state.config=normalizedConfig({
                projects:["East District Water Main","North Reservoir Link"],
                contractors:["Mainline Works","Civic Pipe Services"],
                weather:["Clear","Cloudy","Rain"],shifts:["Day","Night"],
                labels:{...DEFAULT_LABELS},
                customFields:[{id:"demo-crew",name:"Crew",type:"dropdown",options:["Crew Alpha","Crew Bravo"]}],
                columnOrder:["number","landmark","contractor","quantity","length","remarks","custom:demo-crew"],
                hiddenColumns:[],removedColumns:[]
              });
              report=normalizedReport({project:"East District Water Main",weather:"Clear",shift:"Day",submittedBy:"Jordan Lee",designation:"Site Engineer",signature:"Jordan Lee",rows:[
                {id:makeId(),landmark:"Chainage 0+000 to 0+024",contractor:"Mainline Works",quantity:"4",length:"6",remarks:"Installed and checked",custom:{"demo-crew":"Crew Alpha"}},
                {id:makeId(),landmark:"Chainage 0+024 to 0+036",contractor:"Civic Pipe Services",quantity:"2",length:"6",remarks:"Jointing complete",custom:{"demo-crew":"Crew Bravo"}}
              ]});
              state.templates=state.templates.filter(template=>template.id!=="demo-template");
              state.templates.push({id:"demo-template",name:"DPR Demo Template",config:clone(state.config)});
              state.activeTemplateId="demo-template";
              renderHeader();renderWorkLog();persist("Demo template loaded");dialog.close();
            }
      function download(name,content,type) { const url=URL.createObjectURL(new Blob([content],{type}));const link=make("a",{href:url,download:name});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
      function csvValue(value) { return `"${String(value ?? "").replaceAll('"','""')}"`; }
      function excelColumn(index) { let name="";for(index++;index;index=Math.floor((index-1)/26))name=String.fromCharCode(65+(index-1)%26)+name;return name; }
      function xmlEscape(value) { return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;"); }
      function zipStored(files) {
        const encoder=new TextEncoder();const crcTable=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
        const checksum=bytes=>{let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0;};
        const localParts=[],centralParts=[];let offset=0;
        const write16=(view,pos,value)=>view.setUint16(pos,value,true);const write32=(view,pos,value)=>view.setUint32(pos,value,true);
        files.forEach(([path,content])=>{
          const name=encoder.encode(path),data=encoder.encode(content),crc=checksum(data);
          const local=new Uint8Array(30+name.length+data.length);const localView=new DataView(local.buffer);
          write32(localView,0,0x04034b50);write16(localView,4,20);write16(localView,6,0);write16(localView,8,0);write16(localView,10,0);write16(localView,12,0);write32(localView,14,crc);write32(localView,18,data.length);write32(localView,22,data.length);write16(localView,26,name.length);write16(localView,28,0);local.set(name,30);local.set(data,30+name.length);
          const central=new Uint8Array(46+name.length);const centralView=new DataView(central.buffer);
          write32(centralView,0,0x02014b50);write16(centralView,4,20);write16(centralView,6,20);write16(centralView,8,0);write16(centralView,10,0);write16(centralView,12,0);write16(centralView,14,0);write32(centralView,16,crc);write32(centralView,20,data.length);write32(centralView,24,data.length);write16(centralView,28,name.length);write16(centralView,30,0);write16(centralView,32,0);write16(centralView,34,0);write16(centralView,36,0);write32(centralView,38,0);write32(centralView,42,offset);central.set(name,46);
          localParts.push(local);centralParts.push(central);offset+=local.length;
        });
        const centralSize=centralParts.reduce((sum,part)=>sum+part.length,0);const end=new Uint8Array(22);const endView=new DataView(end.buffer);
        write32(endView,0,0x06054b50);write16(endView,4,0);write16(endView,6,0);write16(endView,8,files.length);write16(endView,10,files.length);write32(endView,12,centralSize);write32(endView,16,offset);write16(endView,20,0);
        const output=new Uint8Array(offset+centralSize+end.length);let cursor=0;for(const part of localParts){output.set(part,cursor);cursor+=part.length;}for(const part of centralParts){output.set(part,cursor);cursor+=part.length;}output.set(end,cursor);return output;
      }
      function exportExcel() {
        const reportHeaders=["Project","Date"];
        const activeColumns=orderedColumnCatalog().filter(column=>column.key!=="number");
        const headers=[...reportHeaders,...activeColumns.map(column=>column.label)];
        const dataRows=report.rows.map((row,index)=>{
          const columns=activeColumns.map(column=>{
            if(column.key.startsWith("custom:"))return row.custom[column.key.slice(7)]||"";
            const cell=({number:index+1,landmark:row.landmark,contractor:row.contractor,quantity:number(row.quantity),length:number(row.length),remarks:row.remarks})[column.key]??"";
            return cell;
          });
          return [report.project,activeDate,...columns];
        });
        const allRows=[headers,...dataRows];
        const sheetRows=allRows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((value,columnIndex)=>{const reference=`${excelColumn(columnIndex)}${rowIndex+1}`,style=rowIndex===0?' s="1"':'';if(typeof value==="number"&&Number.isFinite(value))return `<c r="${reference}"${style}><v>${value}</v></c>`;return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;}).join("")}</row>`).join("");
        const files=[
          ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
          ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
          ["xl/workbook.xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Daily Progress Report" sheetId="1" r:id="rId1"/></sheets></workbook>'],
          ["xl/_rels/workbook.xml.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
          ["xl/styles.xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
          ["xl/worksheets/sheet1.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${excelColumn(headers.length-1)}${allRows.length}"/></worksheet>`]
        ];
        download(filename("xlsx"),zipStored(files),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      }
      function parseCsv(source) {
        const input=String(source).replace(/^\uFEFF/,"");const rows=[];let row=[];let field="";let quoted=false;
        for(let index=0;index<input.length;index++){
          const character=input[index];
          if(quoted){if(character==='"'&&input[index+1]==='"'){field+='"';index++;}else if(character==='"')quoted=false;else field+=character;continue;}
          if(character==='"'){quoted=true;continue;}
          if(character===","){row.push(field);field="";continue;}
          if(character==="\n"||character==="\r"){row.push(field);field="";if(row.some(value=>value!==""))rows.push(row);row=[];if(character==="\r"&&input[index+1]==="\n")index++;continue;}
          field+=character;
        }
        if(quoted)throw new Error("The CSV contains an unclosed quoted field.");
        if(field!==""||row.length){row.push(field);if(row.some(value=>value!==""))rows.push(row);}
        return rows;
      }
      function xmlDocument(source) {
        const documentValue=new DOMParser().parseFromString(source,"application/xml");
        if(documentValue.getElementsByTagName("parsererror").length)throw new Error("The workbook contains invalid XML.");
        return documentValue;
      }
      async function readXlsxRows(file) {
        const bytes=new Uint8Array(await file.arrayBuffer());const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let endOffset=-1;
        for(let index=bytes.length-22;index>=Math.max(0,bytes.length-65557);index--){if(view.getUint32(index,true)===0x06054b50){endOffset=index;break;}}
        if(endOffset<0)throw new Error("This is not a valid .xlsx workbook.");
        const entryCount=view.getUint16(endOffset+10,true),directoryOffset=view.getUint32(endOffset+16,true),entries=new Map(),decoder=new TextDecoder();let cursor=directoryOffset;
        for(let index=0;index<entryCount;index++){
          if(view.getUint32(cursor,true)!==0x02014b50)throw new Error("The workbook ZIP directory is invalid.");
          const method=view.getUint16(cursor+10,true),compressedSize=view.getUint32(cursor+20,true),nameLength=view.getUint16(cursor+28,true),extraLength=view.getUint16(cursor+30,true),commentLength=view.getUint16(cursor+32,true),localOffset=view.getUint32(cursor+42,true),name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength));
          entries.set(name,{method,compressedSize,localOffset});cursor+=46+nameLength+extraLength+commentLength;
        }
        async function readEntry(path) {
          const entry=entries.get(path);if(!entry)throw new Error(`Workbook part missing: ${path}`);
          const local=entry.localOffset;if(view.getUint32(local,true)!==0x04034b50)throw new Error("The workbook ZIP entry is invalid.");
          const nameLength=view.getUint16(local+26,true),extraLength=view.getUint16(local+28,true),start=local+30+nameLength+extraLength,compressed=bytes.slice(start,start+entry.compressedSize);
          if(entry.method===0)return decoder.decode(compressed);
          if(entry.method!==8||typeof DecompressionStream==="undefined")throw new Error("This browser cannot decompress this Excel workbook.");
          const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
          return decoder.decode(await new Response(stream).arrayBuffer());
        }
        const workbook=xmlDocument(await readEntry("xl/workbook.xml"));
        const sheet=workbook.getElementsByTagNameNS("*","sheet")[0];if(!sheet)throw new Error("The workbook has no worksheet.");
        const relationId=sheet.getAttribute("r:id")||sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
        const relationships=xmlDocument(await readEntry("xl/_rels/workbook.xml.rels"));
        const relationship=[...relationships.getElementsByTagNameNS("*","Relationship")].find(item=>item.getAttribute("Id")===relationId);if(!relationship)throw new Error("The first worksheet could not be located.");
        const target=relationship.getAttribute("Target");const pathParts=(target.startsWith("/")?target.slice(1):`xl/${target}`).split("/");const normalizedPath=[];
        pathParts.forEach(part=>{if(part==="..")normalizedPath.pop();else if(part!==".")normalizedPath.push(part);});
        let sharedStrings=[];if(entries.has("xl/sharedStrings.xml")){const shared=xmlDocument(await readEntry("xl/sharedStrings.xml"));sharedStrings=[...shared.getElementsByTagNameNS("*","si")].map(item=>[...item.getElementsByTagNameNS("*","t")].map(node=>node.textContent).join(""));}
        const worksheet=xmlDocument(await readEntry(normalizedPath.join("/")));const rowNodes=[...worksheet.getElementsByTagNameNS("*","sheetData")[0]?.getElementsByTagNameNS("*","row")||[]];
        return rowNodes.map(rowNode=>{const values=[];[...rowNode.getElementsByTagNameNS("*","c")].forEach(cell=>{const reference=cell.getAttribute("r")||"A1",letters=reference.match(/^[A-Z]+/i)?.[0]||"A";let column=0;for(const letter of letters.toUpperCase())column=column*26+letter.charCodeAt(0)-64;column--;const type=cell.getAttribute("t");let value="";if(type==="inlineStr")value=[...cell.getElementsByTagNameNS("*","t")].map(node=>node.textContent).join("");else{const raw=cell.getElementsByTagNameNS("*","v")[0]?.textContent||"";value=type==="s"?sharedStrings[Number(raw)]||"":raw;}values[column]=value;});return values.map(value=>value??"");});
      }
      async function importExcel(file) {
        try{
          const records=/\.xlsx$/i.test(file.name)?await readXlsxRows(file):parseCsv(await file.text());
          if(records.length<2)throw new Error("The Excel file has no report rows.");
          const headers=records[0].map(value=>String(value).trim());const projectIndex=headers.indexOf("Project"),dateIndex=headers.indexOf("Date");
          if(projectIndex<0||dateIndex<0)throw new Error("This file needs Project and Date columns from an exported DPR sheet.");
          const entries=records.slice(1).filter(values=>values.some(value=>String(value).trim()));if(!entries.length)throw new Error("The Excel file has no report rows.");
          const first=entries[0];const rawDate=String(first[dateIndex]||"");const importedDate=/^\d{4}-\d{2}-\d{2}$/.test(rawDate)?rawDate:activeDate;
          if(importedDate!==activeDate){state.reports[activeDate]=report;activeDate=importedDate;}
          const get=(values,key)=>{const index=headers.indexOf(key);return index<0?"":String(values[index]||"");};
          const activeColumns=orderedColumnCatalog();
          const rows=entries.map(values=>{const row=freshRow();activeColumns.forEach(column=>{const index=headers.indexOf(column.label);if(index<0)return;const value=String(values[index]||"");if(column.key.startsWith("custom:")){row.custom[column.key.slice(7)]=value;return;}if(["landmark","contractor","quantity","length","remarks"].includes(column.key))row[column.key]=value;});return row;});
          report=normalizedReport({project:get(first,"Project"),weather:get(first,"Weather"),shift:get(first,"Shift"),submittedBy:"",designation:"",signature:"",rows});
          renderHeader();renderWorkLog();persist("Excel file imported");
        }catch(error){alert(`Could not import Excel data. ${error.message||"Check the workbook and try again."}`);}
        $("#import-excel-file").value="";
      }
      async function saveTemplateAsNew() {
        const name=$("#template-name").value.trim();
        if(!name){alert("Enter a name for this template.");return;}
        if(state.templates.some(template=>template.name.toLocaleLowerCase()===name.toLocaleLowerCase())){alert("A template with this name already exists. Choose a unique name or update the selected template.");return;}
        if(!applyManager({updateTemplate:false}))return;
        try {
          const saved=await saveTemplate(name,clone(state.config));
          const template=fromSupabaseTemplate(saved);state.templates.push(template);state.activeTemplateId=template.id;persist(`Template saved: ${name}`);renderTemplateLibrary(template.id);
        } catch(error) { alert(`Could not save template. ${error.message}`); }
      }
      async function updateActiveTemplate() {
        const id=$("#template-select").value;const template=state.templates.find(item=>item.id===id);
        if(!template || id!==state.activeTemplateId){alert("Load a template before updating it.");return;}
        const name=$("#template-name").value.trim() || template.name;
        if(state.templates.some(item=>item.id!==id && item.name.toLocaleLowerCase()===name.toLocaleLowerCase())){alert("A template with this name already exists.");return;}
        if(!applyManager({updateTemplate:false}))return;
        try {
          const saved=await updateSupabaseTemplate(id,name,clone(state.config));
          Object.assign(template,fromSupabaseTemplate(saved));persist(`Template updated: ${name}`);renderTemplateLibrary(id);
        } catch(error) { alert(`Could not update template. ${error.message}`); }
      }
      function loadSelectedTemplate() {
        const id=$("#template-select").value;const template=state.templates.find(item=>item.id===id);
        if(!template)return;
        if(!confirm("Load this template? Unsaved configuration edits will be discarded. Daily reports will not be changed."))return;
        state.config=normalizedConfig(clone(template.config));state.activeTemplateId=template.id;
        renderManager();renderHeader();renderWorkLog();persist(`Template loaded: ${template.name}`);
      }
      async function deleteSelectedTemplate() {
        const id=$("#template-select").value;const template=state.templates.find(item=>item.id===id);
        if(!template)return;
        if(!confirm(`Delete the saved template "${template.name}"? Daily reports will remain unchanged.`))return;
        try {
          await deleteSupabaseTemplate(id);
          state.templates=state.templates.filter(item=>item.id!==id);if(state.activeTemplateId===id)state.activeTemplateId="";
          persist("Template deleted");renderTemplateLibrary();
        } catch(error) { alert(`Could not delete template. ${error.message}`); }
      }
      function changeDate(nextDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
        state.reports[activeDate]=report;activeDate=nextDate;report=normalizedReport(state.reports[activeDate]);renderHeader();renderWorkLog();persist();
      }

      $("#report-date").addEventListener("change",event=>changeDate(event.target.value));
        $("#header-template").addEventListener("change",()=>{const id=$("#header-template").value;if(!id){state.activeTemplateId="";persist("No template selected");return;}$("#template-select").value=id;loadSelectedTemplate();if(state.activeTemplateId!==id)renderHeaderTemplatePicker();});
      $("#project-select").addEventListener("change",event=>{report.project=event.target.value;persist();});
      $("#weather-select").addEventListener("change",event=>{report.weather=event.target.value;persist();});
      $("#shift-select").addEventListener("change",event=>{report.shift=event.target.value;persist();});
      ["submittedBy","designation","signature"].forEach(key=>$("#"+({submittedBy:"submitted-by",designation:"designation",signature:"signature"})[key]).addEventListener("input",event=>{report[key]=event.target.value;persist();}));
      $("#work-rows").addEventListener("input",event=>{
        const control=event.target.closest("[data-key]");if(!control)return;const row=report.rows.find(item=>item.id===control.closest("tr").dataset.rowId);if(!row)return;
        if(control.dataset.key.startsWith("custom:"))row.custom[control.dataset.key.slice(7)]=control.value;else row[control.dataset.key]=control.value;
        updateTotals();persist();
      });
      $("#work-rows").addEventListener("change",event=>{
        const control=event.target.closest("select[data-key]");if(!control)return;const row=report.rows.find(item=>item.id===control.closest("tr").dataset.rowId);if(!row)return;
        if(control.dataset.key.startsWith("custom:"))row.custom[control.dataset.key.slice(7)]=control.value;else row[control.dataset.key]=control.value;
        persist();
      });
      $("#work-rows").addEventListener("click",event=>{const button=event.target.closest("[data-remove-row]");if(!button)return;report.rows=report.rows.filter(row=>row.id!==button.dataset.removeRow);if(!report.rows.length)report.rows.push(freshRow());renderWorkLog();persist();});
      $("#add-row").addEventListener("click",()=>{report.rows.push(freshRow());renderWorkLog();$("#work-rows tr:last-child select")?.focus();persist();});
      $("#manage-button").addEventListener("click",()=>{renderManager();dialog.showModal();});
        $("#template-select").addEventListener("change",()=>renderTemplateLibrary($("#template-select").value));
        $("#load-template").addEventListener("click",loadSelectedTemplate);
        $("#update-template").addEventListener("click",updateActiveTemplate);
        $("#delete-template").addEventListener("click",deleteSelectedTemplate);
        $("#save-template-new").addEventListener("click",saveTemplateAsNew);
        $("#manage-button").addEventListener("click",()=>{renderManager();dialog.showModal();});
      $("#close-manager").addEventListener("click",()=>dialog.close());
      $("#save-config").addEventListener("click",async()=>{
        if(!applyManager())return;
        const template=state.templates.find(item=>item.id===state.activeTemplateId);
        if(template){
          try {
            const saved=await updateSupabaseTemplate(template.id,template.name,clone(state.config));
            Object.assign(template,fromSupabaseTemplate(saved));persist(`Template updated: ${template.name}`);renderTemplateLibrary(template.id);
          } catch(error) { alert(`Could not save template changes. ${error.message}`);return; }
        }
        dialog.close();
      });
        $("#load-demo").addEventListener("click",loadDemoTemplate);
      $("#add-custom-field").addEventListener("click",()=>{
        if(!applyManager())return;
        let index=state.config.customFields.length+1;
        let name=`Custom column ${index}`;
        while(state.config.customFields.some(field=>field.name.toLocaleLowerCase()===name.toLocaleLowerCase()))name=`Custom column ${++index}`;
        const field={id:makeId(),name,type:"text",options:[]};
        state.config.customFields.push(field);
        state.config.columnOrder.push(`custom:${field.id}`);
        const activeTemplate=state.templates.find(template=>template.id===state.activeTemplateId);
        if(activeTemplate)activeTemplate.config=clone(state.config);
        renderManager();renderHeader();renderWorkLog();persist(`Added ${name}`);
        $$('#custom-config [data-custom-prop="name"]').at(-1)?.focus();
      });
        $("#restore-column-button").addEventListener("click",()=>{const key=$("#restore-column").value;if(!key)return;state.config.removedColumns=state.config.removedColumns.filter(item=>item!==key);state.config.hiddenColumns=state.config.hiddenColumns.filter(item=>item!==key);renderColumnManager();});
      dialog.addEventListener("click",event=>{
        const removeColumn=event.target.closest("[data-remove-column]");
        if(removeColumn){const key=removeColumn.dataset.removeColumn;if(key==="number")return;if(!state.config.removedColumns.includes(key))state.config.removedColumns.push(key);state.config.hiddenColumns=state.config.hiddenColumns.filter(item=>item!==key);renderColumnManager();return;}
        const moveColumn=event.target.closest("[data-move-column]");
        if(moveColumn){const row=moveColumn.closest("[data-column-config]");const sibling=moveColumn.dataset.moveColumn==="up"?row.previousElementSibling:row.nextElementSibling;if(sibling){if(moveColumn.dataset.moveColumn==="up")row.parentElement.insertBefore(row,sibling);else row.parentElement.insertBefore(sibling,row);}return;}
        const removeCustom=event.target.closest("[data-remove-custom]");
        if(removeCustom){const field=state.config.customFields[Number(removeCustom.dataset.removeCustom)];if(field)state.config.removedColumns=state.config.removedColumns.filter(key=>key!==`custom:${field.id}`);state.config.customFields.splice(Number(removeCustom.dataset.removeCustom),1);renderCustomManager();renderColumnManager();}
      });
      $("#print-button").addEventListener("click",()=>window.print());
        $("#print-button").addEventListener("click",()=>window.print());
      $("#export-excel-button").addEventListener("click",exportExcel);
      $("#import-excel-button").addEventListener("click",()=>$("#import-excel-file").click());
      $("#import-excel-file").addEventListener("change",event=>{if(event.target.files?.[0])importExcel(event.target.files[0]);});
      $("#clear-day").addEventListener("click",()=>{if(!confirm("Clear this day's report? Saved templates will remain."))return;report=freshReport();renderHeader();renderWorkLog();persist();});
      renderHeader();renderWorkLog();persist();loadTemplates();
    })();
