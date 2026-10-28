import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {renderToString} from 'react-dom/server';
import {createElement} from 'react';
const server=await createServer({configFile:false,plugins:[react()],optimizeDeps:{noDiscovery:true,entries:[]},server:{middlewareMode:true},appType:'custom'});
try{
  const module=await server.ssrLoadModule('/src/components/Scanner.tsx');
  const html=renderToString(createElement(module.default,{date:'2026-10-25',libraryReady:true,onPick(){},notify(){},onLogged(){}}));
  for(const text of ['Scan a whole meal','Review your meal','Single dish','EXPERIMENTAL','capture="environment"'])assert.ok(html.includes(text),text);
  console.log('Scanner render verified: mixed-meal default, recipe review, camera input, experimental label and single-dish fallback.');
}finally{await server.close();}
