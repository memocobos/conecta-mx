// Meta Pixel — eventos personalizados con deduplicación por eventID.
// Funciones globales expuestas en window.
// Safe: si fbq no existe (dev o adblock) las llamadas son no-ops.
(function(){
  'use strict';

  function genEventId(){
    return 'ce_'+Date.now()+'_'+Math.random().toString(36).slice(2,10);
  }

  function getCookie(name){
    var m=document.cookie.match(new RegExp('(?:^|; )'+name.replace(/[.$?*|{}()[\]\\/+^]/g,'\\$&')+'=([^;]*)'));
    return m?decodeURIComponent(m[1]):undefined;
  }

  var IS_DEV=/localhost|127\.0\.0\.1|\.netlify\.app$/i.test(location.hostname);

  // Envío server-side a Meta CAPI (fire-and-forget)
  // Se ejecuta DESPUÉS de fbq() con el mismo event_id → Meta deduplica
  function sendToCAPI(eventName,eventID,customData){
    try{
      var ud={client_user_agent:navigator.userAgent};
      var fbp=getCookie('_fbp'); if(fbp)ud.fbp=fbp;
      var fbc=getCookie('_fbc'); if(fbc)ud.fbc=fbc;
      var payload={
        event_name:eventName,
        event_id:eventID,
        event_time:Math.floor(Date.now()/1000),
        event_source_url:location.href,
        user_data:ud,
        custom_data:customData||{}
      };
      fetch('/.netlify/functions/meta-capi',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
        keepalive:true  // sobrevive a navegación (p.ej. clic a wa.me)
      }).catch(function(err){
        if(IS_DEV&&window.console)console.error('[capi]',err);
      });
    }catch(err){
      if(IS_DEV&&window.console)console.error('[capi]',err);
    }
  }

  function trackMetaEvent(eventName,params){
    if(typeof fbq!=='function')return null;
    params=params||{};
    var eventID=params.eventID||genEventId();
    var data={};
    for(var k in params){
      if(params.hasOwnProperty(k)&&k!=='eventID')data[k]=params[k];
    }
    if(!data.currency)data.currency='MXN';
    try{fbq('track',eventName,data,{eventID:eventID});}
    catch(e){if(window.console)console.warn('[meta-events]',e);}
    // Espejo server-side para deduplicación CAPI
    sendToCAPI(eventName,eventID,data);
    return eventID;
  }

  function trackViewContent(eventName,eventId,price){
    return trackMetaEvent('ViewContent',{
      content_name:String(eventName||''),
      content_ids:[String(eventId||'')],
      content_type:'event',
      value:price?Math.round(price):0,
      currency:'MXN'
    });
  }

  function trackSearch(searchQuery){
    return trackMetaEvent('Search',{
      search_string:String(searchQuery||'')
    });
  }

  function trackAddToCart(packageType,price){
    return trackMetaEvent('AddToCart',{
      content_name:String(packageType||'').toUpperCase(),
      content_type:'package',
      content_category:String(packageType||'').toUpperCase(),
      value:price?Math.round(price):0,
      currency:'MXN'
    });
  }

  function trackInitiateCheckout(eventName,packageType,totalPrice){
    return trackMetaEvent('InitiateCheckout',{
      content_name:String(eventName||''),
      content_category:String(packageType||'').toUpperCase(),
      value:totalPrice?Math.round(totalPrice):0,
      currency:'MXN',
      num_items:1
    });
  }

  function trackContact(context){
    return trackMetaEvent('Contact',{
      content_category:String(context||'home')
    });
  }

  function trackLead(context){
    return trackMetaEvent('Lead',{
      content_category:String(context||'home')
    });
  }

  // --- Auto-trackers vía delegación (sin tocar HTML inline) ---

  // 1) Clics en enlaces WA/Messenger → Contact (excepto #pago-btn-dudas que es Lead)
  document.addEventListener('click',function(e){
    var a=e.target.closest('a, button');
    if(!a)return;

    // Lead explícito: botón "Tengo dudas, hablar con alguien"
    if(a.id==='pago-btn-dudas'){
      trackLead('pago-dudas');
      return;
    }

    // Chat FAB (asistente virtual) → Lead
    if(a.id==='chat-fab'||a.classList.contains('chat-fab')){
      trackLead('chat-fab');
      return;
    }

    // Contact: cualquier WA o Messenger link
    var href=a.getAttribute('href')||'';
    var isWA=/wa\.me\//i.test(href);
    var isMSG=/m\.me\//i.test(href)||/messenger\.com\//i.test(href);
    if(!isWA&&!isMSG)return;
    if(a.hasAttribute('data-no-track'))return;

    // Inferir contexto del entorno
    var ctx='home';
    if(a.closest('#page-detail, .detail'))ctx='evento';
    else if(a.closest('#chat, .chat-widget, .chat-wa-btn'))ctx='chat';
    else if(a.classList.contains('wa-float'))ctx='float';
    else if(a.classList.contains('ft-reserva'))ctx='footer-reserva';
    else if(a.classList.contains('nav-social'))ctx='nav';
    else if(a.id==='pago-btn-comprobante')ctx='pago-comprobante';
    trackContact(ctx);
  },true);

  // 2) Input en el buscador → Search (debounced, min 2 chars)
  var _searchTimer=null;
  document.addEventListener('input',function(e){
    var t=e.target;
    if(!t||t.id!=='ev-search')return;
    clearTimeout(_searchTimer);
    var q=(t.value||'').trim();
    if(q.length<2)return;
    _searchTimer=setTimeout(function(){trackSearch(q);},800);
  },true);

  // Exponer globalmente
  window.trackMetaEvent=trackMetaEvent;
  window.trackViewContent=trackViewContent;
  window.trackSearch=trackSearch;
  window.trackAddToCart=trackAddToCart;
  window.trackInitiateCheckout=trackInitiateCheckout;
  window.trackContact=trackContact;
  window.trackLead=trackLead;
})();
