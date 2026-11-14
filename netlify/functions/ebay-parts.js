// Netlify serverless function: secure eBay OAuth client credentials + live Browse search.
// Configure EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in Netlify environment variables.
const tokenCache = {token:null,expires:0};
exports.handler = async (event) => {
 const json=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)});
 if(event.httpMethod!=='GET')return json(405,{error:'GET only'});
 const {q='',zip=''}=event.queryStringParameters||{};
 if(q.length<5||q.length>100||!/^[0-9]{5}$/.test(zip))return json(400,{error:'Enter a valid search and five-digit US ZIP.'});
 const id=process.env.EBAY_CLIENT_ID,secret=process.env.EBAY_CLIENT_SECRET;
 if(!id||!secret)return json(503,{error:'eBay API credentials are not configured in Netlify.'});
 try {
  if(!tokenCache.token||Date.now()>tokenCache.expires){
   const auth=Buffer.from(id+':'+secret).toString('base64');
   const r=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{'Authorization':'Basic '+auth,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')});
   if(!r.ok)throw Error('Vendor authorization failed ('+r.status+')');
   const t=await r.json();tokenCache.token=t.access_token;tokenCache.expires=Date.now()+(t.expires_in-120)*1000;
  }
  const url='https://api.ebay.com/buy/browse/v1/item_summary/search?'+new URLSearchParams({q,limit:'12',sort:'price',filter:'buyingOptions:{FIXED_PRICE}'});
  const r=await fetch(url,{headers:{'Authorization':'Bearer '+tokenCache.token,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US','X-EBAY-C-ENDUSERCTX':'contextualLocation='+encodeURIComponent('country=US,zip='+zip)}});
  if(!r.ok)throw Error('eBay search unavailable ('+r.status+')');
  const data=await r.json();
  const items=(data.itemSummaries||[]).filter(x=>x.itemWebUrl?.startsWith('https://')).map(x=>{
   const price=Number(x.price?.value),shippingObj=x.shippingOptions?.[0],shippingValue=shippingObj?.shippingCost?.value;
   const shipping=shippingValue===undefined?null:Number(shippingValue);
   const p=Number.isFinite(price)?price:null;
   return {title:String(x.title||'Part listing').slice(0,180),url:x.itemWebUrl,price:p,shipping:Number.isFinite(shipping)?shipping:null,total:p!==null&&Number.isFinite(shipping)?p+shipping:null,delivery:shippingObj?.maxEstimatedDeliveryDate?String(shippingObj.maxEstimatedDeliveryDate).slice(0,10):null};
  });
  return json(200,{items,source:'eBay Browse API',zip});
 }catch(e){return json(502,{error:e.message||'Vendor connection failed'})}
};
