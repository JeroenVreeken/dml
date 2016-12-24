// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');

    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    // The path is absolute if the normalized version is the same as the resolved.
    if (!ret && filename != nodePath['resolve'](filename)) {
      filename = path.join(__dirname, '..', 'src', filename);
      ret = nodeFS['readFileSync'](filename);
    }
    if (ret && !binary) ret = ret.toString();
    return ret;
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function read() { throw 'no read() available (jsc?)' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in: 
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at: 
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      if (!args.splice) args = Array.prototype.slice.call(args);
      args.splice(0, 0, ptr);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, args);
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      sigCache[func] = function dynCall_wrapper() {
        return Runtime.dynCall(sig, func, arguments);
      };
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { var ret = DYNAMICTOP;DYNAMICTOP = (DYNAMICTOP + (assert(DYNAMICTOP > 0),size))|0;DYNAMICTOP = (((DYNAMICTOP)+15)&-16); if (DYNAMICTOP >= TOTAL_MEMORY) { var success = enlargeMemory(); if (!success) { DYNAMICTOP = ret;  return 0; } }; return ret; },
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;



//========================================
// Runtime essentials
//========================================

var ABORT = false; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        ret = Runtime.stackAlloc((str.length << 2) + 1);
        writeStringToMemory(str, ret);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface. 
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    assert(returnType !== 'array', 'Return type should not be "array".');
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
      assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
    }
    if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }
  
  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;


function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if ((typeof _sbrk !== 'undefined' && !_sbrk.called) || !runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

function Pointer_stringify(ptr, /* optional */ length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

function UTF8ArrayToString(u8Array, idx) {
  var u0, u1, u2, u3, u4, u5;

  var str = '';
  while (1) {
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    u0 = u8Array[idx++];
    if (!u0) return str;
    if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
    u1 = u8Array[idx++] & 63;
    if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
    u2 = u8Array[idx++] & 63;
    if ((u0 & 0xF0) == 0xE0) {
      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
    } else {
      u3 = u8Array[idx++] & 63;
      if ((u0 & 0xF8) == 0xF0) {
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
      } else {
        u4 = u8Array[idx++] & 63;
        if ((u0 & 0xFC) == 0xF8) {
          u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
        } else {
          u5 = u8Array[idx++] & 63;
          u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
        }
      }
    }
    if (u0 < 0x10000) {
      str += String.fromCharCode(u0);
    } else {
      var ch = u0 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF16ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
    if (codeUnit == 0)
      return str;
    ++i;
    // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
    str += String.fromCharCode(codeUnit);
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var hasLibcxxabi = !!Module['___cxa_demangle'];
  if (hasLibcxxabi) {
    try {
      var buf = _malloc(func.length);
      writeStringToMemory(func.substr(1), buf);
      var status = _malloc(4);
      var ret = Module['___cxa_demangle'](buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed, we can try ours which may return a partial result
    } catch(e) {
      // failure when using libcxxabi, we can try ours which may return a partial result
      return func;
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  return text.replace(/__Z[\w\d_]+/g, function(x) { var y = demangle(x); return x === y ? x : (x + ' [' + y + ']') });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  return demangleAll(jsStackTrace());
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 4096;

function alignMemoryPage(x) {
  if (x % 4096 > 0) {
    x += (4096 - (x % 4096));
  }
  return x;
}

var HEAP;
var buffer;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE = 0, STATICTOP = 0, staticSealed = false; // static area
var STACK_BASE = 0, STACKTOP = 0, STACK_MAX = 0; // stack area
var DYNAMIC_BASE = 0, DYNAMICTOP = 0; // dynamic area handled by sbrk


function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which adjusts the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}

function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;

var totalMemory = 64*1024;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2*TOTAL_STACK) {
  if (totalMemory < 16*1024*1024) {
    totalMemory *= 2;
  } else {
    totalMemory += 16*1024*1024
  }
}
if (totalMemory !== TOTAL_MEMORY) {
  Module.printErr('increasing TOTAL_MEMORY to ' + totalMemory + ' to be compliant with the asm.js spec (and given that TOTAL_STACK=' + TOTAL_STACK + ')');
  TOTAL_MEMORY = totalMemory;
}

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && !!(new Int32Array(1)['subarray']) && !!(new Int32Array(1)['set']),
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  buffer = new ArrayBuffer(TOTAL_MEMORY);
}
updateGlobalBufferViews();


// Endianness check (note: assumes compiler arch was little-endian)
HEAP32[0] = 255;
if (HEAPU8[0] !== 255 || HEAPU8[3] !== 0) throw 'Typed arrays 2 must be run on a little-endian system';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Runtime.dynCall('v', func);
      } else {
        Runtime.dynCall('vi', func, [callback.arg]);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Tools


function intArrayFromString(stringy, dontAddNull, length /* optional */) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module["intArrayToString"] = intArrayToString;

function writeStringToMemory(string, buffer, dontAddNull) {
  var array = intArrayFromString(string, dontAddNull);
  var i = 0;
  while (i < array.length) {
    var chr = array[i];
    HEAP8[(((buffer)+(i))>>0)]=chr;
    i = i + 1;
  }
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  for (var i = 0; i < array.length; i++) {
    HEAP8[((buffer++)>>0)]=array[i];
  }
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;

// === Body ===

var ASM_CONSTS = [];




STATIC_BASE = 8;

STATICTOP = STATIC_BASE + 55296;
  /* global initializers */  __ATINIT__.push();
  

/* memory initializer */ allocate([0,0,97,67,0,0,122,67,0,128,137,67,0,0,150,67,0,128,162,67,0,0,175,67,0,128,187,67,0,0,200,67,0,128,212,67,0,0,225,67,0,128,237,67,0,0,250,67,0,64,3,68,0,128,9,68,0,192,15,68,0,0,22,68,0,128,162,67,0,0,175,67,0,128,187,67,0,0,200,67,0,128,212,67,0,0,225,67,0,128,237,67,0,0,250,67,0,64,3,68,0,128,9,68,0,192,15,68,0,0,22,68,0,64,28,68,0,128,34,68,0,192,40,68,0,0,47,68,0,0,250,67,0,128,9,68,0,0,22,68,0,128,34,68,0,0,47,68,0,128,59,68,0,0,72,68,0,128,84,68,0,0,97,68,0,128,109,68,0,0,122,68,0,64,131,68,0,128,137,68,0,192,143,68,0,0,150,68,0,64,156,68,0,0,47,68,0,0,72,68,0,0,97,68,0,0,122,68,0,128,137,68,0,0,150,68,0,128,162,68,0,0,175,68,0,128,187,68,0,0,200,68,0,128,212,68,0,0,225,68,0,128,237,68,0,0,250,68,0,64,3,69,0,128,9,69,0,128,109,68,0,64,131,68,0,192,143,68,0,64,156,68,0,192,168,68,0,64,181,68,0,192,193,68,0,64,206,68,0,192,218,68,0,64,231,68,0,192,243,68,0,32,0,69,0,96,6,69,0,160,12,69,0,224,18,69,0,32,25,69,0,128,137,68,0,0,150,68,0,128,162,68,0,0,175,68,0,128,187,68,0,0,200,68,0,128,212,68,0,0,225,68,0,128,237,68,0,0,250,68,0,64,3,69,0,128,9,69,0,192,15,69,0,0,22,69,0,64,28,69,0,128,34,69,0,128,187,68,0,0,200,68,0,128,212,68,0,0,225,68,0,128,237,68,0,0,250,68,0,64,3,69,0,128,9,69,0,192,15,69,0,0,22,69,0,64,28,69,0,128,34,69,0,192,40,69,0,0,47,69,0,64,53,69,0,128,59,69,0,192,15,69,0,0,22,69,0,64,28,69,0,128,34,69,0,192,40,69,0,0,47,69,0,64,53,69,0,128,59,69,0,64,28,69,0,128,34,69,0,192,40,69,0,0,47,69,0,64,53,69,0,128,59,69,0,192,65,69,0,0,72,69,0,64,53,69,0,192,65,69,0,64,78,69,0,192,90,69,1,0,0,0,4,0,0,0,16,0,0,0,8,0,0,0,1,0,0,0,4,0,0,0,16,0,0,0,72,0,0,0,1,0,0,0,4,0,0,0,16,0,0,0,136,0,0,0,1,0,0,0,4,0,0,0,16,0,0,0,200,0,0,0,1,0,0,0,4,0,0,0,16,0,0,0,8,1,0,0,1,0,0,0,4,0,0,0,16,0,0,0,72,1,0,0,1,0,0,0,4,0,0,0,16,0,0,0,136,1,0,0,1,0,0,0,3,0,0,0,8,0,0,0,200,1,0,0,1,0,0,0,3,0,0,0,8,0,0,0,232,1,0,0,1,0,0,0,2,0,0,0,4,0,0,0,8,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,5,0,0,0,32,0,0,0,120,3,0,0,1,0,0,0,5,0,0,0,32,0,0,0,248,3,0,0,1,0,0,0,5,0,0,0,32,0,0,0,120,4,0,0,1,0,0,0,5,0,0,0,32,0,0,0,248,4,0,0,1,0,0,0,5,0,0,0,32,0,0,0,120,5,0,0,1,0,0,0,5,0,0,0,32,0,0,0,248,5,0,0,1,0,0,0,5,0,0,0,32,0,0,0,120,6,0,0,1,0,0,0,5,0,0,0,32,0,0,0,248,6,0,0,1,0,0,0,5,0,0,0,32,0,0,0,120,7,0,0,1,0,0,0,5,0,0,0,32,0,0,0,248,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,200,65,0,0,72,66,0,0,150,66,0,0,200,66,0,0,250,66,0,0,22,67,0,0,47,67,0,0,72,67,0,0,97,67,0,0,122,67,0,128,137,67,0,0,150,67,0,128,162,67,0,0,175,67,0,128,187,67,0,0,200,67,0,128,212,67,0,0,225,67,0,128,237,67,0,0,250,67,0,64,3,68,0,128,9,68,0,192,15,68,0,0,22,68,0,64,28,68,0,128,34,68,0,192,40,68,0,0,47,68,0,64,53,68,0,128,59,68,0,192,65,68,0,0,72,68,0,0,200,65,0,0,72,66,0,0,150,66,0,0,200,66,0,0,250,66,0,0,22,67,0,0,47,67,0,0,72,67,0,0,97,67,0,0,122,67,0,128,137,67,0,0,150,67,0,128,162,67,0,0,175,67,0,128,187,67,0,0,200,67,0,128,212,67,0,0,225,67,0,128,237,67,0,0,250,67,0,64,3,68,0,128,9,68,0,192,15,68,0,0,22,68,0,64,28,68,0,128,34,68,0,192,40,68,0,0,47,68,0,64,53,68,0,128,59,68,0,192,65,68,0,0,72,68,0,0,200,65,0,0,72,66,0,0,150,66,0,0,200,66,0,0,250,66,0,0,22,67,0,0,47,67,0,0,72,67,0,0,97,67,0,0,122,67,0,128,137,67,0,0,150,67,0,128,162,67,0,0,175,67,0,128,187,67,0,0,200,67,0,128,212,67,0,0,225,67,0,128,237,67,0,0,250,67,0,64,3,68,0,128,9,68,0,192,15,68,0,0,22,68,0,64,28,68,0,128,34,68,0,192,40,68,0,0,47,68,0,64,53,68,0,128,59,68,0,192,65,68,0,0,72,68,0,0,200,65,0,0,72,66,0,0,150,66,0,0,200,66,0,0,250,66,0,0,22,67,0,0,47,67,0,0,72,67,0,0,122,67,0,0,150,67,0,0,175,67,0,0,200,67,0,0,225,67,0,0,250,67,0,128,9,68,0,0,22,68,0,128,34,68,0,0,47,68,0,128,59,68,0,0,72,68,0,128,84,68,0,0,97,68,0,128,109,68,0,0,122,68,0,64,131,68,0,128,137,68,0,192,143,68,0,0,150,68,0,64,156,68,0,128,162,68,0,192,168,68,0,0,175,68,0,0,200,65,0,0,72,66,0,0,150,66,0,0,200,66,0,0,250,66,0,0,22,67,0,0,47,67,0,0,72,67,0,0,122,67,0,0,150,67,0,0,175,67,0,0,200,67,0,0,225,67,0,0,250,67,0,128,9,68,0,0,22,68,0,128,34,68,0,0,47,68,0,128,59,68,0,0,72,68,0,128,84,68,0,0,97,68,0,128,109,68,0,0,122,68,0,64,131,68,0,128,137,68,0,192,143,68,0,0,150,68,0,64,156,68,0,128,162,68,0,192,168,68,0,0,175,68,0,0,200,65,0,0,72,66,0,0,150,66,0,0,200,66,0,0,250,66,0,0,22,67,0,0,47,67,0,0,72,67,0,0,122,67,0,0,150,67,0,0,175,67,0,0,200,67,0,0,225,67,0,0,250,67,0,128,9,68,0,0,22,68,0,128,34,68,0,0,47,68,0,128,59,68,0,0,72,68,0,128,84,68,0,0,97,68,0,128,109,68,0,0,122,68,0,64,131,68,0,128,137,68,0,192,143,68,0,0,150,68,0,64,156,68,0,128,162,68,0,192,168,68,0,0,175,68,0,0,200,65,0,0,72,66,0,0,150,66,0,0,200,66,0,0,250,66,0,0,22,67,0,0,47,67,0,0,72,67,0,0,97,67,0,0,122,67,0,128,137,67,0,0,150,67,0,128,162,67,0,0,175,67,0,128,187,67,0,0,200,67,0,128,212,67,0,0,225,67,0,128,237,67,0,0,250,67,0,64,3,68,0,128,9,68,0,192,15,68,0,0,22,68,0,64,28,68,0,128,34,68,0,192,40,68,0,0,47,68,0,64,53,68,0,128,59,68,0,192,65,68,0,0,72,68,0,0,200,65,0,0,72,66,0,0,150,66,0,0,200,66,0,0,250,66,0,0,22,67,0,0,47,67,0,0,72,67,0,0,97,67,0,0,122,67,0,128,137,67,0,0,150,67,0,128,162,67,0,0,175,67,0,128,187,67,0,0,200,67,0,128,212,67,0,0,225,67,0,128,237,67,0,0,250,67,0,64,3,68,0,128,9,68,0,192,15,68,0,0,22,68,0,64,28,68,0,128,34,68,0,192,40,68,0,0,47,68,0,64,53,68,0,128,59,68,0,192,65,68,0,0,72,68,0,0,200,65,0,0,72,66,0,0,150,66,0,0,200,66,0,0,250,66,0,0,22,67,0,0,47,67,0,0,72,67,0,0,97,67,0,0,122,67,0,128,137,67,0,0,150,67,0,128,162,67,0,0,175,67,0,128,187,67,0,0,200,67,0,128,212,67,0,0,225,67,0,128,237,67,0,0,250,67,0,64,3,68,0,128,9,68,0,192,15,68,0,0,22,68,0,64,28,68,0,128,34,68,0,192,40,68,0,0,47,68,0,64,53,68,0,128,59,68,0,192,65,68,0,0,72,68,0,0,200,65,0,0,72,66,0,0,150,66,0,0,200,66,0,0,250,66,0,0,22,67,0,0,47,67,0,0,72,67,0,0,97,67,0,0,122,67,0,128,137,67,0,0,150,67,0,128,162,67,0,0,175,67,0,128,187,67,0,0,200,67,0,128,212,67,0,0,225,67,0,128,237,67,0,0,250,67,0,64,3,68,0,128,9,68,0,192,15,68,0,0,22,68,0,64,28,68,0,128,34,68,0,192,40,68,0,0,47,68,0,64,53,68,0,128,59,68,0,192,65,68,0,0,72,68,2,0,0,0,8,0,0,0,0,1,0,0,152,8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,164,112,45,64,94,75,64,65,238,124,63,61,170,72,47,192,46,203,247,61,36,57,6,65,157,70,202,191,59,110,100,191,133,182,152,63,181,50,245,191,104,151,63,62,237,182,81,192,206,28,170,62,254,67,245,192,74,94,189,191,3,248,249,65,185,136,195,63,14,173,221,65,180,61,6,191,252,0,168,64,9,167,13,63,166,10,238,64,104,236,87,191,148,251,249,191,147,227,16,64,191,195,9,65,20,148,18,62,48,100,23,64,86,211,29,63,246,98,164,63,221,12,219,191,11,198,176,65,103,10,129,63,8,44,139,65,247,142,218,189,216,158,181,63,18,132,11,190,170,96,100,65,118,195,218,191,85,65,164,193,22,53,212,63,74,7,89,192,184,92,13,62,181,166,158,192,18,103,9,63,205,204,248,191,180,4,73,62,88,104,19,66,160,224,162,63,182,115,180,65,121,147,43,191,30,249,243,191,144,161,195,62,15,214,204,64,235,196,65,191,40,213,156,192,213,38,234,63,64,164,147,64,248,56,163,62,228,160,60,63,114,225,28,63,159,205,4,192,80,255,209,190,251,75,198,65,160,84,227,63,237,13,83,65,33,6,218,61,231,255,213,189,166,209,68,62,216,240,34,65,152,134,233,191,155,230,246,192,177,108,110,63,175,37,139,64,189,28,158,62,131,192,130,192,84,86,203,62,65,241,60,193,97,137,71,189,193,232,36,66,124,153,96,63,181,102,15,66,220,129,66,191,95,9,244,62,18,133,122,63,230,150,245,64,186,247,152,191,49,124,66,64,245,243,40,64,207,78,90,192,204,182,67,62,232,159,102,64,26,77,206,62,88,202,138,63,178,186,9,192,93,220,144,65,139,253,197,63,210,41,5,65,236,133,18,190,240,109,130,192,211,190,25,190,86,188,187,64,195,71,180,191,120,11,80,192,154,119,200,63,120,156,38,193,117,114,54,62,144,160,35,193,143,109,185,62,70,238,233,188,178,157,143,189,39,32,195,65,171,65,24,63,198,220,139,65,11,239,146,190,36,238,220,192,160,252,237,62,186,73,35,65,34,224,128,191,23,183,101,193,173,23,21,64,87,67,108,192,197,230,171,62,149,14,26,64,56,132,130,63,43,246,73,192,168,53,161,191,165,189,255,64,97,142,24,64,222,113,157,65,147,115,194,189,183,122,26,192,155,90,86,62,204,69,213,64,91,37,14,192,65,159,176,63,9,109,165,63,18,247,2,64,24,121,121,62,154,7,100,191,34,136,219,62,118,50,230,192,8,143,142,191,152,93,37,66,247,6,39,64,190,31,249,65,116,151,228,190,43,48,34,64,233,238,250,62,14,21,148,64,101,1,143,191,171,120,79,192,215,81,229,63,142,163,6,65,156,193,31,62,111,188,59,62,114,78,8,63,38,228,73,64,57,181,67,191,172,28,148,65,41,208,115,63,63,87,60,65,57,70,170,190,72,168,177,62,87,4,79,62,3,120,107,65,120,69,8,192,170,241,120,193,28,66,173,63,14,161,246,191,40,158,51,188,242,176,130,193,173,80,204,62,179,152,50,192,15,43,64,63,184,47,249,65,198,222,39,63,238,218,195,65,36,11,232,190,145,98,60,191,143,228,146,62,145,126,209,64,89,54,55,191,140,185,69,193,236,52,198,63,162,209,119,64,18,51,139,62,23,102,77,63,219,135,0,63,238,90,155,192,162,123,254,190,95,24,142,65,238,119,152,63,57,69,95,65,124,10,128,60,227,112,170,63,49,9,175,62,71,247,14,65,130,57,20,192,85,164,172,192,68,52,66,63,188,116,251,63,151,28,119,62,80,54,79,192,4,200,136,62,26,192,51,193,44,215,139,190,204,127,2,66,88,115,224,63,94,186,33,66,242,180,72,191,187,237,66,64,144,187,52,63,99,40,181,64,142,117,177,191,116,65,173,63,236,23,24,64,124,97,214,63,234,205,120,62,5,110,151,64,27,130,251,62,124,71,181,62,80,170,205,191,15,139,10,65,220,99,149,63,83,150,191,64,71,231,12,190,206,170,64,193,57,180,128,190,238,90,38,65,184,59,183,191,60,119,14,193,235,255,124,63,16,88,83,193,59,225,133,62,234,91,203,192,153,183,202,62,241,216,51,191,167,65,145,62,97,50,215,65,240,135,215,62,157,17,119,65,241,43,182,190,18,165,91,193,218,1,7,63,66,96,70,65,36,180,149,191,219,249,127,193,107,14,244,63,21,29,186,192,250,127,181,62,31,128,118,64,2,101,83,63,89,52,133,192,47,250,250,190,75,234,80,65,137,94,16,64,34,108,88,65,241,101,162,187,35,45,79,192,213,204,218,60,245,185,251,64,52,186,231,191,117,1,231,190,241,186,138,63,226,6,60,190,152,24,11,62,166,15,17,192,110,106,192,62,90,100,176,192,78,180,251,191,74,187,26,66,199,46,253,63,37,134,196,65,86,100,52,191,95,123,203,64,149,41,246,62,240,167,225,64,119,246,121,191,2,14,27,192,58,35,32,64,152,76,216,64,47,48,171,61,46,144,80,64,69,43,11,63,157,246,104,63,222,176,157,191,100,187,184,65,1,22,73,63,121,233,108,65,230,173,90,190,98,16,216,63,28,149,155,59,217,95,145,65,82,10,198,191,53,239,128,193,20,34,192,63,51,254,81,192,197,28,164,61,160,79,148,192,222,3,244,62,91,148,11,192,110,139,226,62,76,55,33,66,135,80,137,63,106,188,220,65,192,64,24,191,130,86,133,192,76,79,216,62,2,183,243,64,4,114,109,191,247,199,232,192,103,237,254,63,32,239,165,63,49,38,149,62,157,133,25,64,196,152,56,63,235,173,249,191,185,227,77,191,158,111,199,65,114,254,210,63,37,245,152,65,242,63,121,61,30,52,23,191,75,60,136,62,233,166,17,65,21,140,250,191,115,157,56,192,144,247,142,63,154,8,43,64,130,139,181,62,20,232,47,192,214,85,169,62,99,127,98,193,62,33,7,191,106,77,30,66,35,188,125,63,174,199,44,66,69,241,22,191,209,116,162,63,29,147,73,63,253,176,11,65,51,196,129,191,126,53,131,63,91,211,52,64,208,155,242,63,222,171,118,62,107,183,47,64,78,185,218,62,111,216,34,64,130,255,249,191,109,231,67,65,97,108,185,63,161,248,64,65,55,139,87,190,133,66,88,192,228,75,104,189,150,67,35,65,220,128,211,191,165,73,163,192,94,186,165,63,50,85,68,193,188,146,228,61,145,208,10,193,146,60,167,62,230,116,149,191,17,110,178,60,163,1,249,65,171,33,233,62,72,191,171,65,172,57,192,190,232,193,87,192,144,136,201,62,254,212,52,65,5,249,89,191,183,81,155,193,148,217,6,64,164,165,14,192,101,24,191,62,153,71,246,63,135,106,98,63,247,59,220,191,236,161,121,191,44,113,29,65,17,54,0,64,199,41,139,65,47,52,23,189,95,65,142,191,218,4,24,62,142,204,172,64,99,11,245,191,34,195,152,64,29,85,185,63,212,128,9,63,147,168,71,62,21,227,132,191,178,213,253,62,195,71,31,193,252,140,135,191,213,201,3,66,212,183,0,64,78,209,1,66,114,138,158,190,243,2,151,64,36,70,223,62,46,86,148,64,159,89,158,191,63,140,160,191,146,116,1,64,123,218,22,65,3,233,66,62,131,250,186,63,183,65,245,62,205,6,31,64,162,11,138,191,11,198,129,65,243,147,154,63,165,119,26,65,251,35,132,190,228,15,214,191,36,39,147,61,240,167,86,65,19,73,240,191,117,147,128,193,161,16,165,63,181,224,155,192,29,173,138,61,77,21,87,193,138,0,223,62,199,75,133,192,231,169,238,62,76,183,244,65,51,167,103,63,180,200,172,65,213,179,4,191,27,13,34,192,216,186,172,62,111,100,180,64,215,18,14,191,57,52,139,193,134,143,216,63,156,167,146,63,136,103,105,62,248,168,99,63,125,89,22,63,243,89,183,192,76,54,134,190,50,85,149,65,0,145,178,63,240,5,136,65,162,98,156,188,64,222,137,64,177,196,155,62,233,183,74,65,102,189,4,192,52,191,206,192,231,168,107,63,70,66,155,63,244,225,145,62,72,138,228,191,227,193,86,62,39,49,128,193,73,213,34,191,73,157,252,65,50,201,172,63,195,181,10,66,106,188,120,191,165,160,169,64,143,26,23,63,6,100,142,64,247,175,200,191,143,141,102,64,223,79,9,64,123,136,144,64,50,144,151,62,111,216,131,64,59,254,227,62,215,103,94,63,42,145,184,191,237,13,98,65,55,137,173,63,159,60,192,64,208,241,81,188,231,227,239,192,246,40,220,190,126,0,8,65,72,51,154,191,211,159,227,192,57,238,140,63,59,199,218,192,153,45,73,62,238,124,199,192,78,157,223,62,245,156,144,191,239,111,16,62,214,214,182,65,125,230,148,62,191,125,150,65,172,143,7,191,185,112,247,192,45,96,34,63,5,163,44,65,27,216,170,191,61,155,162,193,228,102,232,63,253,159,243,191,88,32,202,62,141,11,115,64,12,145,59,63,237,240,2,193,43,194,61,191,245,74,60,65,10,0,0,0,9,0,0,0,0,2,0,0,216,16,0,0,5,0,0,0,9,0,0,0,0,2,0,0,216,96,0,0,5,0,0,0,9,0,0,0,0,2,0,0,216,136,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,195,212,222,62,172,58,43,63,131,81,129,63,185,54,156,63,107,130,192,63,101,112,228,63,96,171,8,64,202,224,22,64,57,156,39,64,12,60,47,64,125,150,55,62,243,147,170,62,208,41,0,63,234,4,76,63,100,30,133,63,127,19,158,63,145,126,211,63,205,146,236,63,45,9,40,64,161,132,51,64,48,158,137,62,33,145,182,62,69,131,24,63,239,172,133,63,175,235,159,63,252,222,182,63,74,239,215,63,41,174,238,63,22,193,21,64,25,226,32,64,67,231,245,61,29,143,41,62,208,41,248,62,130,139,117,63,98,103,158,63,48,187,195,63,135,51,235,63,12,229,6,64,9,51,31,64,18,20,49,64,179,209,25,62,164,254,106,62,86,212,32,63,207,20,118,63,200,36,171,63,108,149,204,63,10,186,245,63,107,241,13,64,115,99,34,64,162,156,48,64,22,137,137,62,74,36,177,62,187,211,17,63,114,54,65,63,60,162,106,63,215,23,193,63,30,167,228,63,111,42,250,63,97,166,23,64,210,29,32,64,52,248,123,62,65,16,240,62,110,167,41,63,6,216,99,63,208,213,146,63,197,85,193,63,198,249,227,63,226,35,6,64,233,241,41,64,67,57,51,64,235,58,68,62,121,174,143,62,80,85,201,62,94,156,28,63,33,200,181,63,57,151,218,63,114,191,239,63,204,127,6,64,65,241,17,64,165,247,31,64,140,44,185,62,213,205,1,63,188,59,74,63,0,227,133,63,253,77,192,63,235,168,214,63,46,226,243,63,56,103,10,64,38,170,27,64,208,208,37,64,229,39,85,62,134,172,150,62,91,179,229,62,254,184,49,63,70,93,95,63,63,0,137,63,95,7,218,63,163,204,10,64,178,70,27,64,94,162,38,64,212,69,162,62,120,124,3,63,204,154,52,63,223,194,106,63,215,134,150,63,111,211,167,63,73,46,207,63,248,107,2,64,82,213,28,64,228,20,37,64,136,218,118,62,144,101,193,62,64,135,5,63,158,154,55,63,132,187,167,63,100,30,197,63,87,67,222,63,222,84,6,64,31,17,19,64,36,151,37,64,83,147,112,62,236,81,144,62,188,201,71,63,215,105,184,63,205,1,206,63,179,210,224,63,56,21,253,63,212,130,9,64,169,135,38,64,113,61,46,64,161,247,54,62,2,127,120,62,115,127,213,62,75,86,53,63,131,163,116,63,31,157,150,63,6,18,228,63,196,124,3,64,146,5,18,64,214,173,28,64,143,168,176,62,204,151,215,62,197,170,61,63,35,45,149,63,162,151,169,63,0,145,190,63,15,185,225,63,97,253,243,63,128,72,25,64,214,139,41,64,121,147,127,62,116,9,183,62,173,79,5,63,198,225,88,63,36,214,182,63,14,132,204,63,187,155,227,63,139,108,11,64,205,117,26,64,100,35,36,64,11,41,151,62,206,0,19,63,130,226,159,63,161,103,187,63,176,32,221,63,14,161,246,63,97,26,6,64,168,58,18,64,224,74,36,64,29,61,46,64,115,17,175,62,252,199,218,62,228,77,34,63,214,224,77,63,77,215,103,63,222,171,170,63,137,41,229,63,246,69,242,63,81,136,28,64,196,148,38,64,100,87,186,62,215,76,2,63,233,215,42,63,65,68,114,63,247,1,184,63,118,50,208,63,111,211,231,63,115,128,2,64,41,174,18,64,17,223,27,64,55,112,39,62,74,8,142,62,148,131,209,62,187,237,102,63,114,51,152,63,83,121,171,63,95,181,230,63,131,250,250,63,155,201,41,64,85,106,52,64,6,244,154,62,140,49,184,62,128,181,38,63,102,160,154,63,205,59,182,63,199,41,198,63,163,233,240,63,109,255,0,64,176,172,16,64,179,12,37,64,151,171,31,62,33,29,94,62,221,124,195,62,43,161,39,63,36,98,142,63,212,130,203,63,217,124,236,63,41,5,253,63,84,87,14,64,248,107,46,64,79,202,140,62,117,2,178,62,152,110,18,63,131,109,60,63,112,237,100,63,128,241,208,63,17,25,242,63,22,164,3,64,234,149,38,64,165,49,46,64,51,52,30,62,215,77,121,62,221,67,178,62,102,131,48,63,155,114,201,63,194,163,217,63,31,186,248,63,73,128,6,64,100,35,36,64,158,123,49,64,61,209,149,62,197,231,238,62,118,194,75,63,127,19,134,63,203,243,180,63,218,27,224,63,100,6,4,64,181,195,21,64,99,69,39,64,83,63,49,64,187,185,120,62,135,22,185,62,199,76,14,63,44,41,75,63,159,170,110,63,131,105,180,63,247,146,238,63,36,156,0,64,94,186,29,64,255,91,43,64,43,247,98,62,170,127,176,62,232,247,13,63,40,186,58,63,32,123,145,63,102,160,166,63,44,188,195,63,66,120,10,64,29,85,25,64,131,23,39,64,15,213,36,62,173,218,101,62,37,59,190,62,36,123,32,63,2,154,148,63,135,220,184,63,47,134,214,63,162,156,240,63,56,161,30,64,96,2,43,64,232,79,91,62,59,228,174,62,5,52,45,63,177,54,122,63,177,167,169,63,61,44,220,63,81,165,4,64,139,166,23,64,109,168,40,64,178,215,49,64,194,48,80,62,56,49,148,62,215,223,234,62,238,5,106,63,136,186,143,63,21,198,166,63,69,187,202,63,165,131,241,63,16,6,12,64,160,84,27,64,92,142,143,62,91,66,190,62,221,39,83,63,254,212,140,63,201,60,158,63,208,15,179,63,55,253,201,63,37,6,1,64,52,157,23,64,68,110,32,64,216,184,46,62,12,233,128,62,54,145,201,62,161,188,27,63,20,208,164,63,124,44,185,63,51,138,229,63,214,86,2,64,127,217,19,64,250,39,48,64,247,233,56,62,132,214,147,62,0,228,124,63,70,66,183,63,37,175,214,63,89,52,245,63,4,255,7,64,89,134,18,64,44,188,37,64,204,69,48,64,42,145,52,62,160,83,136,62,57,14,228,62,212,214,52,63,88,26,96,63,62,34,182,63,25,28,225,63,25,255,250,63,149,72,26,64,18,131,38,64,116,92,93,62,158,38,147,62,201,29,246,62,37,64,129,63,82,73,165,63,138,2,189,63,94,162,242,63,84,29,4,64,10,46,18,64,70,235,30,64,114,194,52,62,20,65,140,62,93,139,206,62,227,84,119,63,17,1,167,63,214,226,183,63,234,236,248,63,5,110,5,64,111,216,34,64,125,203,48,64,248,168,159,62,162,237,12,63,224,44,97,63,68,81,140,63,152,105,163,63,132,42,189,63,185,170,232,63,181,224,9,64,190,222,35,64,230,232,49,64,81,20,56,62,102,73,128,62,214,112,233,62,212,14,131,63,15,209,156,63,109,226,188,63,7,8,222,63,74,152,245,63,5,110,9,64,32,12,28,64,214,196,138,62,181,26,234,62,212,128,25,63,68,48,82,63,8,172,112,63,103,184,153,63,160,195,236,63,224,74,254,63,56,21,35,64,227,25,48,64,60,161,55,62,60,244,125,62,194,81,218,62,216,42,81,63,11,152,164,63,147,82,200,63,212,130,7,64,17,30,19,64,52,162,36,64,61,44,48,64,137,178,191,62,26,51,9,63,98,162,101,63,96,176,151,63,145,184,203,63,238,235,224,63,117,229,251,63,245,132,11,64,225,69,29,64,85,217,39,64,95,236,61,62,223,196,144,62,253,161,209,62,219,81,40,63,12,64,91,63,97,195,131,63,140,161,240,63,189,111,4,64,56,16,22,64,202,50,48,64,90,126,192,62,194,21,20,63,56,74,66,63,41,233,109,63,68,81,144,63,84,53,161,63,71,32,218,63,190,222,7,64,132,129,21,64,38,228,31,64,111,14,103,62,237,216,184,62,9,110,0,63,135,139,72,63,1,77,168,63,116,239,185,63,68,105,219,63,66,91,254,63,222,113,14,64,234,91,46,64,213,121,20,62,153,126,129,62,65,212,33,63,225,238,156,63,190,164,201,63,254,101,243,63,135,249,10,64,197,254,24,64,164,170,43,64,65,212,51,64,137,38,48,62,61,212,134,62,91,179,229,62,65,188,58,63,226,231,123,63,253,246,149,63,4,231,224,63,219,191,254,63,88,144,20,64,129,91,49,64,120,99,113,62,156,197,179,62,189,255,75,63,129,33,135,63,156,109,166,63,194,192,203,63,222,171,242,63,236,221,7,64,182,190,26,64,115,99,38,64,60,19,130,62,153,132,163,62,107,71,233,62,163,6,139,63,232,19,213,63,142,59,245,63,247,199,3,64,90,240,14,64,57,238,28,64,248,141,37,64,132,70,192,62,202,52,62,63,146,232,145,63,184,59,171,63,213,38,222,63,231,227,0,64,32,41,20,64,132,240,30,64,125,179,41,64,92,85,48,64,203,45,125,62,205,86,246,62,140,218,53,63,63,201,101,63,225,127,143,63,101,199,162,63,227,199,228,63,156,196,12,64,141,127,27,64,35,103,47,64,139,135,103,62,50,117,159,62,1,108,0,63,44,44,88,63,227,112,174,63,243,2,196,63,35,132,227,63,7,182,254,63,214,255,11,64,170,241,22,64,12,144,72,62,172,170,151,62,187,11,28,63,123,130,72,63,6,42,159,63,125,5,185,63,51,138,209,63,239,114,1,64,166,242,30,64,92,90,41,64,184,230,110,62,85,80,153,62,203,17,242,62,78,238,159,63,208,155,186,63,192,9,205,63,76,108,234,63,56,50,255,63,92,56,38,64,247,88,48,64,92,33,44,62,58,144,101,62,65,241,195,62,123,161,24,63,106,193,135,63,142,175,165,63,139,137,205,63,82,155,236,63,143,228,22,64,156,109,36,64,80,252,168,62,148,78,228,62,6,102,41,63,177,219,95,63,227,25,128,63,236,250,185,63,170,212,248,63,66,236,4,64,218,32,27,64,232,48,39,64,175,208,103,62,97,25,147,62,119,131,4,63,6,101,78,63,164,141,167,63,219,80,241,63,204,69,10,64,139,84,18,64,54,176,33,64,224,74,42,64,204,11,80,62,22,166,255,62,229,41,99,63,198,22,158,63,246,64,187,63,149,96,217,63,184,233,255,63,138,171,14,64,66,149,36,64,115,17,49,64,180,116,157,62,124,183,193,62,216,215,18,63,235,83,54,63,173,164,89,63,80,141,167,63,33,200,3,64,109,226,16,64,64,222,31,64,5,81,43,64,123,106,141,62,190,159,2,63,32,210,47,63,201,32,103,63,254,67,154,63,64,251,169,63,150,4,220,63,40,126,2,64,178,104,16,64,27,158,44,64,178,213,37,62,31,157,106,62,110,136,201,62,67,1,47,63,194,163,145,63,232,77,169,63,240,80,228,63,14,21,251,63,134,230,24,64,137,181,40,64,128,42,78,62,49,181,141,62,251,31,240,62,109,142,119,63,150,236,188,63,35,243,208,63,90,158,251,63,60,160,12,64,253,193,30,64,50,230,44,64,178,188,91,62,220,126,161,62,11,98,240,62,232,191,59,63,33,176,146,63,142,146,163,63,220,41,221,63,76,137,14,64,56,45,28,64,120,151,43,64,68,222,130,62,49,10,202,62,1,79,62,63,215,80,122,63,116,123,153,63,211,246,179,63,42,140,245,63,157,99,14,64,13,171,30,64,251,116,42,64,138,228,123,62,68,139,180,62,183,93,4,63,68,134,77,63,207,131,199,63,220,215,229,63,161,214,248,63,143,141,8,64,76,84,21,64,254,183,30,64,181,194,172,62,80,251,245,62,37,121,94,63,110,221,145,63,190,188,208,63,193,86,233,63,46,202,4,64,31,186,18,64,17,170,30,64,62,5,40,64,2,71,98,62,48,187,183,62,0,87,18,63,233,182,64,63,21,224,111,63,144,107,147,63,189,82,214,63,130,255,3,64,18,194,35,64,210,58,50,64,31,248,136,62,162,213,169,62,64,134,10,63,28,235,142,63,149,159,180,63,22,53,196,63,99,127,229,63,149,125,247,63,162,238,15,64,163,59,40,64,149,73,173,61,194,53,215,61,245,71,152,62,43,189,106,63,112,206,160,63,112,148,200,63,118,84,241,63,213,38,12,64,100,117,33,64,196,177,50,64,129,65,82,62,229,14,147,62,87,118,57,63,175,37,132,63,62,150,186,63,160,50,210,63,11,123,246,63,184,59,11,64,57,127,27,64,89,192,38,64,163,34,110,62,59,109,173,62,156,138,0,63,82,39,92,63,190,164,133,63,118,113,159,63,92,61,231,63,52,244,255,63,216,182,16,64,80,112,29,64,147,81,149,62,213,34,194,62,65,70,32,63,174,244,74,63,39,137,117,63,60,160,192,63,29,3,222,63,200,181,245,63,173,81,39,64,225,64,46,64,187,38,68,62,225,182,134,62,35,133,218,62,30,82,28,63,146,232,137,63,94,46,234,63,161,103,1,64,251,121,13,64,158,94,27,64,254,72,39,64,205,62,199,62,36,242,45,63,146,88,106,63,159,176,132,63,218,27,160,63,9,22,203,63,65,159,2,64,25,4,18,64,33,89,36,64,38,1,46,64,169,19,80,62,95,65,154,62,162,210,240,62,249,48,43,63,112,11,90,63,182,246,122,63,241,17,201,63,94,104,2,64,31,128,18,64,136,104,44,64,71,174,155,62,149,214,207,62,132,212,53,63,214,115,118,63,44,125,144,63,216,187,171,63,82,73,209,63,105,53,236,63,105,29,5,64,11,123,32,64,79,230,47,62,95,123,118,62,19,153,209,62,156,83,73,63,209,145,156,63,156,22,176,63,151,139,216,63,182,219,238,63,30,109,22,64,183,156,31,64,16,205,108,62,59,85,142,62,95,208,14,63,120,180,169,63,89,134,212,63,0,198,227,63,251,116,0,64,74,7,11,64,127,48,28,64,114,191,41,64,140,157,64,62,102,220,132,62,214,56,211,62,182,245,31,63,175,236,86,63,72,80,132,63,44,43,209,63,207,73,247,63,198,191,15,64,209,63,27,64,214,252,184,62,30,196,214,62,108,177,75,63,77,161,151,63,139,253,165,63,166,10,202,63,119,190,235,63,126,169,255,63,53,152,34,64,26,250,43,64,125,122,140,62,72,137,173,62,125,33,252,62,252,168,118,63,160,55,193,63,169,106,218,63,58,88,239,63,90,240,4,64,208,184,16,64,114,109,28,64,164,252,212,62,57,240,38,63,80,1,132,63,157,128,162,63,223,79,201,63,174,240,226,63,89,76,0,64,160,55,11,64,29,143,27,64,224,45,38,64,165,218,119,62,28,236,189,62,234,205,8,63,163,118,67,63,87,38,128,63,250,155,144,63,0,82,215,63,200,65,9,64,72,196,20,64,7,206,45,64,142,63,193,62,46,146,22,63,220,240,67,63,89,20,122,63,181,166,173,63,69,187,190,63,205,117,222,63,235,110,0,64,25,173,13,64,69,245,24,64,88,57,68,62,146,120,145,62,253,136,207,62,217,37,130,63,178,99,183,63,110,23,198,63,220,46,232,63,59,170,250,63,24,33,30,64,122,141,41,64,170,155,139,62,223,248,178,62,254,71,34,63,70,124,147,63,130,231,166,63,17,25,198,63,45,178,245,63,132,13,3,64,150,4,36,64,211,193,46,64,20,119,44,62,126,0,114,62,167,202,215,62,7,211,84,63,112,177,138,63,115,215,198,63,195,187,240,63,11,36,4,64,44,188,23,64,65,130,40,64,230,148,96,62,184,91,154,62,103,124,3,63,173,220,67,63,160,84,131,63,13,224,193,63,181,21,3,64,146,232,15,64,227,252,31,64,111,13,42,64,153,71,110,62,28,38,178,62,63,139,253,62,62,5,56,63,49,37,182,63,141,122,220,63,20,150,240,63,4,144,10,64,96,229,26,64,253,188,37,64,170,98,138,62,146,121,172,62,130,87,47,63,237,240,147,63,175,95,216,63,4,57,240,63,68,192,1,64,188,121,14,64,141,151,28,64,125,63,37,64,56,75,25,62,157,101,70,62,214,59,180,62,200,38,5,63,246,239,82,63,227,165,183,63,46,226,215,63,247,6,251,63,253,188,23,64,66,91,44,64,129,119,130,62,97,25,211,62,210,252,25,63,246,124,69,63,37,117,150,63,114,51,176,63,239,254,196,63,237,240,247,63,45,38,26,64,90,18,36,64,118,82,111,62,177,54,182,62,93,254,23,63,27,76,67,63,219,191,162,63,224,45,200,63,35,21,230,63,103,15,6,64,234,120,34,64,252,140,45,64,30,83,55,62,33,203,114,62,187,43,203,62,233,96,133,63,215,23,209,63,128,159,225,63,120,238,7,64,10,162,20,64,232,164,37,64,244,21,48,64,73,101,58,62,47,136,128,62,103,129,222,62,127,220,54,63,138,116,115,63,27,13,184,63,16,35,232,63,120,11,252,63,25,86,9,64,114,167,22,64,203,100,0,63,156,48,49,63,228,78,89,63,176,32,137,63,127,222,172,63,72,167,190,63,220,186,235,63,134,172,6,64,203,219,21,64,131,250,32,64,50,143,140,62,9,80,195,62,162,212,6,63,144,17,108,63,31,244,184,63,186,107,201,63,45,236,237,63,162,69,4,64,42,58,18,64,210,29,40,64,203,162,184,62,19,72,21,63,236,191,122,63,178,133,160,63,65,130,190,63,114,22,230,63,158,12,14,64,10,220,30,64,253,130,47,64,128,43,55,64,127,75,16,62,150,150,97,62,246,154,30,63,145,124,81,63,7,182,134,63,35,132,171,63,92,85,234,63,163,146,8,64,13,84,34,64,132,18,48,64,120,71,150,62,185,139,200,62,175,66,74,63,33,118,118,63,94,133,148,63,161,103,195,63,76,26,231,63,72,167,2,64,200,36,23,64,78,40,36,64,189,84,76,62,185,197,148,62,84,225,231,62,14,132,48,63,131,23,161,63,243,118,180,63,80,112,241,63,175,153,14,64,179,205,29,64,111,129,46,64,230,5,152,62,75,116,182,62,8,199,72,63,63,29,127,63,7,182,146,63,249,218,207,63,78,98,232,63,130,115,2,64,185,112,38,64,48,42,45,64,228,103,83,62,38,83,141,62,174,156,9,63,92,117,77,63,101,54,156,63,6,47,210,63,110,139,238,63,113,32,0,64,33,200,13,64,222,118,37,64,44,212,170,62,216,243,237,62,154,93,39,63,212,95,119,63,157,75,141,63,172,139,171,63,13,113,228,63,73,17,245,63,68,23,30,64,127,246,43,64,197,57,58,62,52,191,122,62,215,190,192,62,11,236,13,63,42,58,170,63,127,188,231,63,208,15,3,64,208,242,12,64,136,75,42,64,182,74,52,64,117,176,230,62,221,180,37,63,2,128,115,63,246,93,157,63,144,131,194,63,100,233,215,63,158,36,3,64,80,25,17,64,249,20,32,64,110,163,41,64,162,70,97,62,129,36,164,62,168,1,219,62,33,231,25,63,248,225,64,63,211,248,109,63,51,249,222,63,98,74,18,64,146,63,30,64,244,248,47,64,32,238,170,62,89,196,216,62,135,166,40,63,163,1,132,63,36,127,156,63,141,209,174,63,34,113,243,63,26,192,7,64,112,148,18,64,218,254,33,64,174,12,42,62,2,132,111,62,27,71,196,62,30,108,41,63,63,0,157,63,183,40,179,63,250,184,226,63,186,189,252,63,118,26,11,64,234,62,36,64,48,212,65,62,205,114,121,62,160,250,199,62,177,167,177,63,45,91,203,63,217,177,225,63,233,212,5,64,108,62,20,64,101,252,37,64,59,83,48,64,168,52,34,62,107,70,102,62,184,30,197,62,100,32,43,63,111,101,113,63,111,187,180,63,194,163,217,63,51,254,233,63,54,205,3,64,189,82,44,64,8,232,166,62,170,42,236,62,1,250,89,63,211,217,133,63,24,91,164,63,215,18,194,63,61,15,230,63,47,168,5,64,201,2,28,64,53,36,40,64,249,19,101,62,182,16,148,62,248,255,33,63,65,214,91,63,251,92,197,63,41,150,223,63,84,198,247,63,23,212,11,64,139,224,25,64,9,80,37,64,77,188,11,63,204,209,115,63,253,159,171,63,208,39,194,63,107,96,235,63,49,211,0,64,151,173,15,64,138,205,25,64,234,231,37,64,79,59,44,64,41,64,116,62,124,186,178,62,218,57,253,62,157,215,124,63,35,219,149,63,205,146,172,63,101,252,187,63,101,1,19,64,235,57,41,64,111,100,50,64,197,173,138,62,56,78,226,62,124,239,39,63,13,197,97,63,27,47,161,63,128,212,182,63,26,139,226,63,213,207,255,63,89,81,25,64,33,200,41,64,215,22,30,62,172,227,88,62,65,157,250,62,60,76,127,63,26,250,159,63,6,71,197,63,175,177,227,63,240,133,249,63,202,108,20,64,159,229,39,64,29,89,137,62,219,50,160,62,45,208,22,63,202,26,161,63,144,78,201,63,126,116,214,63,250,213,244,63,107,130,4,64,96,234,17,64,88,28,36,64,234,207,46,62,58,93,102,62,95,126,191,62,90,74,10,63,208,184,148,63,135,225,191,63,232,130,246,63,212,72,5,64,159,200,15,64,228,15,30,64,64,18,166,62,200,178,200,62,229,241,52,63,186,103,85,63,113,3,130,63,170,212,200,63,152,52,222,63,234,33,8,64,253,188,35,64,2,217,41,64,25,85,54,62,241,99,132,62,80,141,191,62,194,109,9,63,182,219,170,63,130,57,230,63,92,85,254,63,172,28,12,64,80,170,27,64,218,27,40,64,43,161,75,62,106,135,215,62,110,82,81,63,128,212,150,63,35,190,187,63,92,32,233,63,229,68,13,64,188,92,30,64,251,63,47,64,230,121,54,64,64,221,64,62,233,10,166,62,47,225,240,62,154,63,74,63,62,33,111,63,250,39,152,63,201,142,241,63,145,97,3,64,70,177,28,64,218,85,40,64,71,32,78,62,244,53,187,62,142,201,6,63,183,37,66,63,204,238,145,63,223,55,162,63,197,56,211,63,55,142,240,63,192,149,6,64,39,107,38,64,165,76,10,62,137,126,45,62,184,92,157,62,24,207,0,63,114,80,130,63,109,86,185,63,49,206,231,63,117,147,8,64,232,188,30,64,98,161,48,64,52,71,54,62,27,129,136,62,241,216,199,62,10,190,109,63,194,52,192,63,190,135,207,63,185,136,239,63,177,167,1,64,238,37,37,64,202,84,49,64,34,23,124,62,138,60,217,62,177,222,36,63,89,25,77,63,99,180,142,63,164,141,163,63,202,108,192,63,255,202,4,64,192,236,18,64,156,22,32,64,187,95,165,62,126,87,220,62,138,176,33,63,9,27,134,63,65,101,156,63,23,159,182,63,32,152,243,63,228,15,2,64,27,18,33,64,63,87,45,64,79,3,150,62,121,119,220,62,115,130,30,63,190,104,75,63,84,58,164,63,155,143,211,63,165,160,235,63,16,122,4,64,17,170,24,64,217,206,33,64,198,134,6,63,16,173,73,63,204,151,143,63,242,152,177,63,79,88,214,63,15,214,247,63,172,86,14,64,235,255,24,64,11,152,40,64,21,145,47,64,151,88,153,62,35,130,209,62,19,44,26,63,34,112,100,63,25,57,135,63,137,123,160,63,36,156,190,63,150,231,209,63,213,91,27,64,169,159,41,64,207,246,216,62,45,62,5,63,249,76,66,63,2,72,133,63,126,58,150,63,37,59,182,63,23,188,232,63,72,220,247,63,100,59,23,64,223,26,40,64,84,195,30,62,151,111,125,62,189,53,36,63,180,90,116,63,209,203,156,63,249,160,187,63,87,62,235,63,25,202,5,64,96,229,28,64,145,213,45,64,118,255,128,62,162,153,215,62,166,240,52,63,202,196,121,63,187,68,161,63,167,145,194,63,217,124,232,63,45,207,7,64,237,100,30,64,236,221,45,64,162,98,92,62,64,192,154,62,120,8,59,63,188,118,101,63,10,162,146,63,99,98,175,63,54,176,217,63,159,113,1,64,24,33,18,64,97,79,31,64,171,9,146,62,227,56,232,62,71,230,41,63,248,140,92,63,28,124,129,63,117,171,159,63,39,247,211,63,192,62,238,63,90,13,37,64,28,206,46,64,228,244,37,62,193,172,96,62,156,50,191,62,109,111,11,63,239,56,141,63,101,112,204,63,164,228,245,63,119,45,9,64,25,4,26,64,78,69,42,64,186,74,175,62,153,241,2,63,244,108,110,63,101,228,148,63,32,99,178,63,42,58,206,63,186,131,252,63,97,113,12,64,24,33,30,64,122,141,41,64,98,132,128,62,152,110,186,62,208,154,15,63,147,29,63,63,30,138,130,63,39,218,149,63,181,55,196,63,146,121,18,64,11,239,36,64,199,70,46,64,208,71,161,62,54,148,250,62,158,126,56,63,218,170,96,63,133,148,139,63,40,126,160,63,70,95,185,63,58,35,246,63,128,96,16,64,254,38,26,64,165,219,50,62,184,115,113,62,70,121,198,62,74,237,13,63,91,148,157,63,204,98,186,63,94,17,216,63,36,40,8,64,107,125,23,64,172,57,38,64,149,70,92,62,124,15,175,62,158,152,133,63,223,79,169,63,152,105,191,63,64,246,222,63,74,7,251,63,54,89,15,64,164,223,34,64,90,13,45,64,226,32,97,62,153,129,154,62,189,143,3,63,242,153,52,63,118,166,96,63,13,224,165,63,213,120,217,63,251,87,254,63,26,110,18,64,91,206,31,64,129,206,148,62,73,158,187,62,61,184,39,63,59,194,133,63,3,9,150,63,69,42,196,63,73,128,230,63,138,118,249,63,153,158,32,64,66,62,42,64,120,211,109,62,118,166,160,62,221,150,40,63,104,37,113,63,40,73,187,63,199,46,213,63,23,101,238,63,33,200,1,64,98,45,34,64,30,225,44,64,31,48,167,62,129,124,13,63,217,148,143,63,169,106,170,63,167,145,194,63,122,252,238,63,148,77,5,64,48,71,21,64,92,201,38,64,124,44,47,64,242,209,66,62,148,76,174,62,68,77,252,62,120,95,61,63,239,60,101,63,204,40,138,63,17,83,210,63,16,204,229,63,251,121,31,64,41,174,46,64,47,50,145,62,197,61,214,62,176,89,22,63,19,241,94,63,12,147,181,63,30,220,201,63,4,86,230,63,13,113,4,64,21,145,17,64,213,9,28,64,249,104,113,62,231,29,183,62,119,189,0,63,78,151,129,63,255,33,161,63,118,50,180,63,186,247,232,63,163,88,250,63,170,96,32,64,67,255,46,64,5,140,142,62,167,175,175,62,24,152,89,63,171,207,157,63], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);
/* memory initializer */ allocate([47,221,172,63,196,153,203,63,117,205,228,63,114,220,5,64,164,165,34,64,175,124,42,64,143,224,38,62,172,254,120,62,206,227,224,62,110,80,47,63,191,69,99,63,79,64,187,63,219,220,240,63,254,212,2,64,94,133,18,64,184,30,45,64,91,180,112,62,112,92,190,62,146,5,20,63,29,144,64,63,43,24,129,63,190,246,188,63,74,7,231,63,158,94,17,64,45,236,41,64,160,137,50,64,84,168,30,62,144,16,101,62,225,126,176,62,226,228,42,63,201,113,191,63,54,176,213,63,234,120,4,64,84,169,19,64,19,44,40,64,255,236,51,64,113,116,117,62,80,253,171,62,37,116,55,63,211,222,144,63,217,235,185,63,3,207,209,63,215,192,6,64,146,232,17,64,66,33,32,64,128,212,42,64,250,66,104,62,11,155,169,62,100,6,242,62,197,231,38,63,126,25,72,63,104,34,156,63,202,84,233,63,115,75,5,64,252,29,28,64,252,24,39,64,97,198,100,62,180,28,184,62,93,226,8,63,32,212,61,63,247,233,156,63,67,231,177,63,218,32,207,63,94,162,0,64,125,63,13,64,5,110,29,64,93,107,47,62,215,104,137,62,77,129,196,62,147,226,91,63,69,42,176,63,42,116,194,63,179,234,227,63,234,33,246,63,181,224,39,64,134,90,51,64,74,127,15,62,106,106,89,62,66,238,226,62,67,171,119,63,158,210,161,63,136,244,199,63,99,238,246,63,184,233,13,64,21,198,42,64,2,43,53,64,127,162,98,62,112,237,164,62,183,155,248,62,12,143,81,63,249,131,129,63,45,120,153,63,46,57,182,63,230,174,213,63,207,20,10,64,129,62,23,64,157,71,189,62,83,145,6,63,88,30,56,63,42,141,112,63,220,157,145,63,211,246,167,63,213,202,204,63,233,212,233,63,237,187,22,64,220,41,37,64,249,15,89,62,123,250,160,62,155,113,250,62,16,61,61,63,192,91,176,63,219,249,198,63,245,132,233,63,237,42,10,64,99,151,22,64,104,63,46,64,117,203,46,62,140,189,151,62,77,45,111,63,226,30,159,63,187,39,199,63,200,234,238,63,117,60,10,64,154,66,23,64,34,113,37,64,19,68,47,64,41,206,65,62,57,157,156,62,37,60,225,62,51,220,72,63,219,22,157,63,94,215,171,63,29,56,203,63,228,160,224,63,40,39,28,64,241,41,46,64,191,185,151,62,223,52,197,62,210,172,28,63,178,104,138,63,196,95,163,63,132,245,183,63,84,140,239,63,46,28,0,64,167,179,21,64,93,249,40,64,30,25,107,62,88,30,164,62,85,108,4,63,93,25,120,63,104,63,146,63,184,35,208,63,175,95,240,63,178,99,7,64,202,253,34,64,51,80,45,64,132,215,126,62,137,35,215,62,200,125,59,63,74,70,134,63,36,214,166,63,164,252,204,63,183,127,249,63,80,83,15,64,112,124,41,64,164,165,52,64,24,149,84,62,248,170,149,62,92,58,254,62,30,110,91,63,71,85,151,63,73,46,179,63,152,105,219,63,125,34,239,63,197,201,1,64,237,216,12,64,173,248,102,62,21,54,203,62,74,178,10,63,234,148,95,63,125,232,150,63,163,88,166,63,41,174,214,63,177,191,236,63,150,38,21,64,145,44,48,64,144,16,53,62,24,238,108,62,81,219,190,62,81,49,2,63,155,143,147,63,47,110,231,63,38,54,7,64,38,1,16,64,214,144,36,64,62,232,47,64,224,76,180,62,45,9,4,63,135,249,130,63,228,78,161,63,231,198,184,63,253,159,207,63,233,183,239,63,89,105,6,64,93,80,31,64,82,242,42,64,20,32,42,62,34,226,134,62,111,132,189,62,145,14,23,63,209,59,65,63,197,198,112,63,245,132,225,63,132,42,249,63,11,123,28,64,47,134,48,64,95,37,175,62,37,236,243,62,59,254,39,63,220,13,90,63,191,130,128,63,161,161,147,63,25,226,216,63,30,51,4,64,104,92,16,64,107,43,28,64,209,176,104,62,113,198,192,62,17,171,3,63,80,23,101,63,62,34,146,63,251,58,164,63,169,106,234,63,249,49,254,63,245,103,21,64,121,59,50,64,136,18,93,62,50,2,138,62,230,33,47,63,171,236,179,63,45,96,214,63,224,132,230,63,134,3,11,64,187,184,21,64,72,220,37,64,245,185,46,64,230,232,113,62,55,254,204,62,132,159,8,63,123,22,64,63,77,16,105,63,245,103,139,63,240,109,222,63,245,214,244,63,63,82,12,64,39,20,44,64,198,77,45,62,169,219,145,62,126,143,106,63,6,187,149,63,212,130,183,63,11,123,210,63,185,165,245,63,251,87,10,64,231,227,30,64,142,175,43,64,65,157,138,62,132,74,172,62,51,135,244,62,133,119,133,63,42,140,205,63,130,255,229,63,148,19,249,63,24,62,10,64,216,182,22,64,63,87,33,64,12,87,215,62,94,14,39,63,25,255,142,63,35,248,179,63,100,175,223,63,15,69,249,63,109,255,12,64,192,9,23,64,203,16,35,64,172,168,43,64,149,39,144,62,74,66,202,62,231,226,35,63,201,204,113,63,174,211,152,63,127,77,170,63,13,253,219,63,149,14,12,64,42,116,28,64,238,8,37,64,101,167,159,62,48,43,244,62,137,40,34,63,253,135,88,63,4,144,170,63,183,238,190,63,54,200,216,63,14,161,2,64,56,132,18,64,33,31,28,64,225,40,9,62,229,155,77,62,83,177,37,63,229,124,109,63,56,45,152,63,5,81,175,63,47,139,217,63,14,132,252,63,138,229,18,64,77,103,43,64,11,182,81,62,50,114,142,62,216,13,227,62,23,159,162,63,236,221,179,63,171,9,210,63,6,129,233,63,11,239,20,64,128,96,38,64,34,113,49,64,162,98,60,62,139,249,121,62,96,57,210,62,65,156,35,63,16,93,156,63,200,210,179,63,26,110,208,63,39,131,243,63,213,202,10,64,156,162,19,64,57,239,175,62,150,149,222,62,59,166,42,63,197,57,94,63,170,67,134,63,35,50,196,63,48,240,232,63,144,102,252,63,16,122,18,64,82,184,28,64,186,186,115,62,91,6,164,62,221,65,40,63,142,232,106,63,221,210,166,63,34,26,221,63,154,148,254,63,224,156,11,64,159,89,28,64,163,64,39,64,154,176,165,62,202,136,11,63,209,31,110,63,137,239,156,63,209,87,184,63,186,218,226,63,22,164,3,64,133,66,22,64,205,30,44,64,10,133,52,64,162,238,147,62,153,130,205,62,215,251,29,63,201,33,86,63,178,132,125,63,252,111,161,63,92,230,244,63,15,11,7,64,235,197,20,64,130,168,35,64,185,83,170,62,241,43,246,62,64,249,39,63,207,106,97,63,243,200,131,63,178,128,157,63,143,112,226,63,155,85,247,63,221,210,12,64,21,116,37,64,21,1,62,62,56,220,135,62,18,161,209,62,102,221,27,63,13,113,132,63,94,133,156,63,142,64,240,63,80,252,10,64,242,210,25,64,244,166,42,64,35,191,30,62,87,181,100,62,134,169,205,62,66,33,138,63,155,56,181,63,209,92,207,63,205,233,2,64,110,139,16,64,118,108,40,64,184,88,51,64,51,221,59,62,142,178,134,62,144,244,217,62,65,188,34,63,3,38,152,63,135,196,173,63,70,153,201,63,178,128,5,64,99,122,18,64,7,182,32,64,87,37,161,62,199,15,237,62,94,19,38,63,188,173,96,63,179,94,128,63,16,6,162,63,163,88,0,64,172,173,12,64,99,209,30,64,32,181,45,64,225,70,122,62,24,11,163,62,137,236,11,63,90,42,75,63,72,191,169,63,53,36,222,63,108,9,249,63,151,86,7,64,178,46,20,64,60,160,30,64,137,8,167,62,112,37,11,63,177,195,124,63,232,246,166,63,201,171,215,63,167,121,243,63,70,66,13,64,10,244,23,64,146,174,35,64,140,214,45,64,3,149,33,62,246,12,145,62,32,93,220,62,153,14,41,63,161,161,79,63,192,62,146,63,180,89,189,63,176,254,219,63,138,229,42,64,108,62,54,64,19,40,98,62,172,87,145,62,210,169,71,63,162,151,137,63,127,246,167,63,149,43,208,63,206,54,235,63,67,4,252,63,189,251,9,64,101,141,38,64,45,36,16,62,0,168,82,62,195,40,208,62,131,48,67,63,86,72,133,63,176,85,190,63,190,77,235,63,197,85,7,64,61,97,35,64,9,109,49,64,99,210,15,62,7,182,202,62,185,199,74,63,242,210,141,63,181,137,179,63,22,193,207,63,36,185,248,63,188,150,14,64,73,244,34,64,55,137,49,64,242,96,107,62,191,68,172,62,82,237,11,63,254,101,79,63,48,216,153,63,157,99,172,63,22,164,233,63,145,242,5,64,102,73,18,64,136,75,30,64,152,79,102,62,220,15,168,62,190,107,4,63,111,242,95,63,141,156,129,63,9,225,185,63,82,15,217,63,157,244,0,64,153,187,32,64,99,11,43,64,222,176,125,62,63,230,171,62,58,235,11,63,41,206,53,63,233,212,149,63,57,40,221,63,62,63,252,63,91,37,10,64,134,230,30,64,16,64,40,64,176,231,203,62,46,26,14,63,23,239,99,63,123,131,143,63,250,213,176,63,27,245,204,63,99,238,238,63,87,67,4,64,36,238,25,64,31,162,37,64,25,84,75,62,96,230,147,62,126,195,244,62,243,145,40,63,64,18,90,63,3,120,131,63,51,22,197,63,222,89,1,64,223,21,37,64,1,48,50,64,105,201,155,62,220,71,190,62,246,93,41,63,86,212,136,63,57,180,156,63,31,186,180,63,72,27,215,63,160,84,239,63,140,103,6,64,72,191,19,64,136,189,64,62,149,16,132,62,204,99,221,62,61,44,60,63,137,181,168,63,217,37,190,63,130,255,233,63,223,248,2,64,55,166,19,64,108,67,29,64,244,164,124,62,143,52,152,62,224,190,26,63,146,203,167,63,46,4,201,63,61,44,216,63,208,242,244,63,254,72,3,64,171,149,35,64,18,194,45,64,193,27,34,62,33,35,112,62,33,32,223,62,127,251,42,63,28,35,117,63,160,50,158,63,117,229,203,63,120,185,232,63,71,172,19,64,206,54,49,64,169,245,214,62,137,92,0,63,9,83,68,63,162,93,137,63,71,61,152,63,217,119,189,63,243,31,226,63,3,9,246,63,156,109,34,64,29,119,44,64,38,223,140,62,234,206,171,62,0,173,45,63,63,111,138,63,28,211,203,63,138,229,226,63,223,50,247,63,59,1,9,64,251,92,21,64,64,106,31,64,32,126,190,62,42,88,91,63,63,169,158,63,141,122,180,63,192,91,216,63,112,119,238,63,30,167,4,64,216,129,17,64,26,23,34,64,123,49,44,64,103,123,164,62,247,144,216,62,216,215,26,63,176,30,75,63,44,128,105,63,13,113,144,63,172,226,229,63,51,22,11,64,179,12,23,64,30,80,34,64,125,89,202,62,149,73,25,63,152,161,69,63,200,91,114,63,37,93,155,63,136,75,170,63,178,133,212,63,64,19,253,63,88,144,10,64,108,4,22,64,96,177,102,62,90,186,162,62,102,250,237,62,212,96,142,63,27,76,175,63,55,137,193,63,117,2,246,63,18,107,3,64,59,252,37,64,31,191,49,64,250,69,169,62,20,204,208,62,188,233,58,63,213,62,161,63,14,219,186,63,152,134,205,63,145,155,253,63,198,196,8,64,116,210,29,64,136,128,43,64,175,66,90,62,240,80,156,62,205,203,1,63,109,140,41,63,220,70,135,63,13,108,189,63,210,0,214,63,205,146,6,64,243,171,23,64,83,63,37,64,7,238,96,62,229,153,151,62,89,19,227,62,186,104,28,63,141,184,76,63,44,154,214,63,45,149,251,63,133,206,9,64,137,36,32,64,29,90,44,64,78,37,51,62,94,246,131,62,141,65,191,62,8,117,13,63,135,225,179,63,190,159,206,63,105,169,236,63,223,137,7,64,37,88,20,64,197,143,45,64,242,178,86,62,185,85,152,62,255,149,65,63,202,50,140,63,181,55,200,63,108,33,236,63,5,163,6,64,241,186,18,64,128,72,33,64,196,124,43,64,168,56,46,62,211,19,118,62,235,140,231,62,194,53,47,63,93,78,97,63,60,247,174,63,99,238,222,63,14,103,8,64,225,93,32,64,21,227,46,64,131,107,142,62,237,240,239,62,230,31,53,63,160,139,90,63,8,3,135,63,90,240,154,63,134,61,197,63,254,43,11,64,65,72,26,64,77,45,39,64,200,121,31,62,149,159,116,62,236,166,180,62,164,250,30,63,27,129,184,63,84,82,207,63,44,159,233,63,157,215,252,63,169,159,33,64,146,232,47,64,137,37,101,62,77,129,140,62,200,69,245,62,70,65,76,63,56,219,216,63,144,102,240,63,109,168,8,64,49,235,23,64,92,27,38,64,225,180,46,64,208,182,26,62,124,11,75,62,156,50,167,62,98,73,9,63,114,140,88,63,150,33,146,63,161,243,186,63,185,165,225,63,135,167,1,64,226,88,11,64,147,111,222,62,188,60,29,63,125,61,99,63,64,164,131,63,124,126,152,63,156,51,178,63,208,184,228,63,172,255,3,64,252,24,27,64,152,163,39,64,215,23,57,62,144,245,140,62,189,170,203,62,105,255,91,63,4,115,180,63,38,252,194,63,50,85,244,63,187,68,5,64,44,241,24,64,229,155,47,64,152,76,141,62,141,39,2,63,24,208,99,63,179,210,168,63,77,16,209,63,49,206,243,63,15,209,10,64,110,250,23,64,173,134,46,64,58,64,54,64,30,253,31,62,167,118,134,62,89,53,208,62,244,51,61,63,217,177,133,63,232,193,153,63,62,203,231,63,192,91,0,64,147,58,37,64,81,131,51,64,148,20,72,62,162,125,132,62,25,169,39,63,250,9,83,63,113,90,168,63,236,23,192,63,82,10,226,63,106,24,4,64,229,213,21,64,206,223,32,64,139,78,54,62,213,34,154,62,245,16,237,62,12,87,55,63,146,116,153,63,222,147,171,63,221,210,234,63,148,106,1,64,227,165,25,64,188,174,49,64,183,68,174,62,5,248,206,62,206,255,87,63,209,5,133,63,190,222,153,63,98,161,218,63,21,29,245,63,64,217,10,64,149,96,33,64,247,228,39,64,74,181,95,62,198,82,148,62,245,45,7,63,65,42,81,63,132,240,144,63,131,76,202,63,191,96,235,63,185,223,253,63,122,112,9,64,195,71,22,64,230,31,165,62,148,134,234,62,11,153,39,63,115,127,117,63,129,33,143,63,53,41,169,63,191,96,243,63,98,248,2,64,122,25,23,64,149,130,42,64,185,108,68,62,56,48,129,62,20,66,199,62,177,195,20,63,58,204,195,63,158,65,247,63,222,89,5,64,55,79,17,64,69,71,36,64,54,176,45,64,117,232,252,62,194,248,53,63,100,117,123,63,96,31,153,63,155,172,181,63,251,121,207,63,8,201,246,63,84,82,9,64,90,129,27,64,173,134,38,64,120,67,90,62,152,136,159,62,228,105,217,62,48,72,26,63,39,165,60,63,36,214,130,63,8,3,255,63,101,252,13,64,242,36,39,64,165,107,54,64,165,133,147,62,13,111,222,62,168,26,33,63,216,44,91,63,232,19,165,63,172,86,182,63,55,26,240,63,136,157,9,64,14,132,22,64,150,91,34,64,43,223,35,62,209,64,108,62,244,52,208,62,27,212,94,63,217,8,148,63,139,55,178,63,192,236,230,63,201,200,249,63,129,120,13,64,221,12,47,64,27,216,106,62,48,130,150,62,40,211,0,63,34,253,158,63,171,231,188,63,136,244,207,63,191,212,255,63,125,63,9,64,247,6,37,64,147,53,48,64,154,148,34,62,219,80,97,62,187,13,186,62,37,232,19,63,17,141,118,63,111,100,150,63,91,124,222,63,109,86,253,63,107,101,10,64,230,92,42,64,10,47,177,62,236,190,227,62,84,140,55,63,213,33,151,63,42,111,175,63,170,241,194,63,160,50,242,63,124,68,4,64,202,84,25,64,149,43,40,64,252,111,157,62,67,86,199,62,208,211,28,63,238,34,120,63,11,99,199,63,39,131,235,63,45,149,255,63,70,8,11,64,154,235,26,64,65,130,34,64,217,39,224,62,219,25,58,63,15,69,165,63,34,108,192,63,156,249,225,63,192,38,251,63,62,121,10,64,203,132,21,64,126,24,37,64,100,88,45,64,164,193,109,62,216,215,170,62,32,67,7,63,129,237,52,63,20,5,154,63,186,131,176,63,126,58,206,63,71,230,9,64,19,242,37,64,62,5,48,64,11,153,139,62,65,101,236,62,236,50,32,63,158,240,86,63,80,199,171,63,217,148,191,63,146,145,219,63,242,205,8,64,188,174,23,64,163,59,38,64,134,88,61,62,54,202,154,62,109,230,232,62,205,91,97,63,83,92,141,63,159,113,165,63,74,123,227,63,5,192,248,63,72,109,28,64,207,218,39,64,126,2,136,62,195,185,174,62,90,160,13,63,39,218,145,63,218,172,182,63,127,188,199,63,89,139,247,63,99,98,5,64,254,43,25,64,68,221,41,64,56,243,43,62,183,70,84,62,6,156,189,62,169,137,6,63,52,244,131,63,222,31,175,63,250,39,228,63,93,254,3,64,241,75,21,64,230,174,33,64,62,180,175,62,183,41,222,62,37,174,55,63,156,197,99,63,231,169,134,63,239,254,216,63,249,102,3,64,105,87,13,64,186,247,38,64,244,248,45,64,65,185,93,62,86,73,156,62,178,75,228,62,129,177,58,63,0,227,209,63,174,158,243,63,22,106,3,64,246,40,14,64,252,169,27,64,113,90,36,64,107,101,226,61,114,254,86,62,7,68,88,63,48,76,150,63,105,0,191,63,242,181,231,63,100,88,11,64,39,49,28,64,102,160,44,64,105,116,53,64,233,153,94,62,68,193,172,62,20,94,250,62,20,8,67,63,1,53,97,63,225,209,154,63,137,65,252,63,48,187,7,64,70,37,39,64,50,172,50,64,175,7,67,62,192,204,151,62,132,159,240,62,85,247,76,63,253,130,141,63,223,166,163,63,23,43,194,63,133,182,216,63,168,82,7,64,17,223,45,64,174,12,10,62,148,51,52,62,78,209,153,62,204,94,254,62,57,69,159,63,163,30,190,63,215,76,238,63,19,102,8,64,15,11,31,64,64,135,49,64,218,55,87,62,226,120,142,62,232,250,222,62,33,115,109,63,58,175,205,63,204,127,224,63,0,145,250,63,85,164,10,64,90,129,25,64,156,249,47,64,121,229,90,62,0,111,161,62,97,138,2,63,249,189,53,63,39,248,118,63,248,170,141,63,93,249,176,63,136,17,0,64,121,175,20,64,10,46,36,64,105,29,205,62,99,99,6,63,231,109,76,63,18,165,129,63,188,87,145,63,227,199,188,63,137,152,254,63,212,96,8,64,149,130,32,64,70,124,43,64,183,98,127,62,41,9,193,62,205,6,5,63,5,21,65,63,221,210,186,63,246,69,210,63,92,27,234,63,252,251,4,64,51,22,19,64,3,236,29,64,230,92,242,62,219,24,47,63,20,179,134,63,51,27,176,63,120,40,198,63,7,177,223,63,75,234,8,64,186,102,20,64,234,9,39,64,223,79,47,64,34,197,80,62,59,255,174,62,131,105,248,62,89,82,98,63,212,125,140,63,246,127,162,63,5,110,189,63,54,2,225,63,99,127,41,64,10,162,52,64,175,204,139,62,97,250,206,62,228,46,14,63,49,93,116,63,6,71,165,63,22,19,179,63,169,135,220,63,236,163,243,63,184,1,11,64,194,76,41,64,247,89,37,61,40,41,240,61,160,252,29,63,238,92,100,63,126,82,161,63,202,84,197,63,42,0,238,63,100,204,9,64,0,227,31,64,206,194,48,64,137,151,7,62,59,110,88,62,224,16,62,63,222,142,136,63,212,96,170,63,166,15,201,63,238,8,239,63,95,123,8,64,24,178,30,64,4,202,46,64,96,6,115,62,207,46,167,62,74,207,28,63,228,104,74,63,91,121,125,63,111,245,180,63,82,126,222,63,171,236,247,63,23,188,10,64,130,231,28,64,124,68,140,62,59,196,207,62,83,145,18,63,33,5,111,63,165,102,135,63,7,240,178,63,198,162,237,63,184,175,255,63,11,94,38,64,127,164,48,64,54,30,76,62,67,197,152,62,218,199,226,62,108,238,32,63,150,207,166,63,28,240,209,63,33,234,230,63,184,59,7,64,95,7,24,64,255,33,35,64,215,75,179,62,186,131,0,63,150,64,82,63,40,242,132,63,229,68,175,63,195,211,203,63,192,149,244,63,239,3,10,64,255,120,29,64,3,207,41,64,95,40,144,62,165,190,204,62,2,183,18,63,52,216,64,63,147,142,102,63,38,252,134,63,166,126,202,63,144,107,11,64,219,138,27,64,51,109,39,64,92,118,176,62,234,36,11,63,171,38,52,63,182,190,92,63,70,95,153,63,119,74,171,63,75,31,202,63,168,227,3,64,203,161,19,64,135,22,31,64,113,255,97,62,173,81,167,62,57,71,5,63,101,80,65,63,149,212,165,63,136,215,185,63,78,98,216,63,159,205,12,64,102,131,26,64,18,107,39,64,190,23,143,62,51,21,170,62,224,48,77,63,191,72,172,63,191,101,190,63,23,217,214,63,166,10,246,63,186,102,6,64,251,121,37,64,47,168,45,64,17,109,39,62,213,66,89,62,221,237,186,62,207,132,6,63,58,174,94,63,73,186,154,63,119,161,229,63,112,148,2,64,255,4,19,64,52,17,30,64,31,49,146,62,132,215,174,62,3,10,65,63,55,195,149,63,237,129,166,63,236,192,193,63,3,149,217,63,230,232,241,63,164,54,37,64,92,61,45,64,213,149,127,62,8,231,187,62,133,93,32,63,223,249,113,63,227,25,180,63,110,192,199,63,214,115,234,63,41,203,14,64,174,216,29,64,168,227,41,64,118,24,139,62,185,226,226,62,62,5,148,63,226,6,180,63,53,152,214,63,35,161,237,63,204,11,4,64,131,192,14,64,42,116,30,64,225,238,40,64,219,191,146,62,99,9,219,62,103,39,35,63,54,172,77,63,104,4,127,63,189,24,162,63,150,67,215,63,11,65,0,64,242,65,25,64,206,170,37,64,92,59,161,62,181,139,225,62,124,180,28,63,131,104,101,63,238,119,188,63,68,221,219,63,20,208,240,63,58,93,6,64,123,160,23,64,200,181,31,64,24,93,46,62,118,166,128,62,174,154,207,62,115,103,106,63,238,61,144,63,126,227,183,63,149,125,219,63,97,84,242,63,48,100,35,64,233,67,47,64,212,14,143,62,57,157,172,62,82,12,60,63,114,249,163,63,77,132,189,63,21,82,206,63,252,53,237,63,58,88,255,63,144,160,26,64,188,232,41,64,47,193,41,62,77,130,103,62,84,200,213,62,103,156,62,63,49,177,133,63,71,119,196,63,154,124,231,63,31,244,248,63,5,221,8,64,186,131,38,64,230,118,135,62,167,93,172,62,173,194,10,63,3,207,53,63,133,208,105,63,158,239,211,63,92,172,232,63,111,216,14,64,109,144,33,64,49,37,42,64,156,253,33,62,251,61,113,62,209,59,173,62,8,170,10,63,50,172,202,63,202,21,226,63,192,149,0,64,226,146,15,64,142,64,32,64,57,156,49,64,31,76,170,62,117,118,2,63,222,171,82,63,112,182,137,63,45,38,186,63,22,77,211,63,199,186,252,63,249,20,16,64,199,99,34,64,12,176,47,64,243,143,134,62,199,43,184,62,62,89,5,63,170,41,53,63,78,128,81,63,61,44,184,63,236,81,252,63,99,156,5,64,3,207,31,64,70,95,41,64,251,203,110,62,61,152,204,62,235,201,28,63,64,138,70,63,15,127,153,63,139,137,173,63,159,205,210,63,82,184,8,64,91,235,21,64,1,135,44,64,141,71,25,62,78,67,116,62,74,151,190,62,231,111,34,63,98,190,160,63,110,134,183,63,172,144,226,63,72,225,246,63,137,41,39,64,167,203,52,64,236,77,12,62,25,88,87,62,211,107,23,63,191,14,144,63,77,21,176,63,233,183,215,63,44,188,5,64,87,4,25,64,223,21,45,64,36,11,54,64,31,157,90,62,179,154,174,62,230,173,10,63,255,3,64,63,35,74,139,63,102,78,159,63,98,21,199,63,204,151,251,63,142,6,12,64,180,142,24,64,113,174,153,62,90,132,250,62,164,52,83,63,177,191,132,63,241,215,152,63,243,118,172,63,227,165,215,63,158,152,1,64,142,204,29,64,13,108,47,64,21,28,46,62,175,147,130,62,148,23,201,62,87,36,58,63,171,231,176,63,244,50,202,63,56,132,230,63,206,194,250,63,220,17,18,64,169,164,46,64,172,26,52,62,255,35,187,62,150,91,142,63,48,100,177,63,189,53,220,63,225,40,253,63,255,178,15,64,169,251,26,64,224,74,40,64,137,65,48,64,254,125,38,62,180,30,126,62,67,197,232,62,170,97,67,63,207,77,119,63,184,35,164,63,227,136,221,63,6,18,248,63,41,174,30,64,78,185,42,64,54,30,132,62,89,21,177,62,24,120,14,63,67,55,123,63,157,70,174,63,161,190,189,63,143,165,239,63,113,32,10,64,111,47,23,64,157,133,35,64,34,194,111,62,141,155,178,62,88,58,7,63,247,229,124,63,248,252,152,63,3,9,182,63,67,226,250,63,213,38,8,64,203,156,38,64,131,192,50,64,4,3,56,62,82,40,15,63,104,32,94,63,28,95,139,63,218,143,168,63,233,38,201,63,166,10,246,63,10,162,12,64,90,18,32,64,177,162,46,64,160,252,93,62,255,31,159,62,141,152,249,62,187,210,110,63,127,217,153,63,28,235,174,63,130,115,230,63,184,30,253,63,19,39,11,64,91,95,34,64,242,92,63,62,167,34,205,62,69,185,20,63,68,166,88,63,157,75,141,63,217,37,162,63,227,223,235,63,246,64,1,64,100,59,31,64,239,230,45,64,166,151,40,62,92,174,126,62,239,89,199,62,170,215,69,63,43,53,155,63,138,89,175,63,219,167,1,64,135,196,17,64,115,133,39,64,87,207,51,64,27,44,180,62,22,52,5,63,118,53,109,63,126,29,156,63,112,66,193,63,177,162,214,63,148,251,245,63,184,30,7,64,238,206,22,64,132,240,34,64,143,254,119,62,163,6,187,62,113,147,1,63,22,77,55,63,32,127,93,63,15,127,129,63,203,185,228,63,232,222,7,64,209,116,22,64,125,34,49,64,115,218,211,62,184,63,15,63,100,93,60,63,191,210,109,63,155,32,138,63,244,50,162,63,34,166,240,63,101,194,9,64,4,202,20,64,17,141,34,64,189,166,87,62,35,189,168,62,27,129,240,62,9,225,73,63,45,149,155,63,137,239,168,63,31,17,219,63,126,198,3,64,74,181,15,64,182,214,41,64,255,175,74,62,176,31,130,62,115,186,244,62,73,17,157,63,56,161,208,63,37,59,226,63,123,247,11,64,122,165,24,64,90,18,38,64,63,111,46,64,181,107,82,62,11,239,170,62,75,31,6,63,112,206,52,63,64,19,141,63,235,144,159,63,40,15,211,63,149,183,1,64,53,7,18,64,137,152,48,64,26,219,107,62,173,21,165,62,39,161,92,63,89,163,146,63,97,113,172,63,249,189,201,63,243,84,231,63,249,78,0,64,0,174,22,64,190,159,36,64,169,75,102,62,48,101,144,62,230,178,1,63,145,126,147,63,30,51,208,63,124,68,224,63,179,205,1,64,38,1,14,64,31,75,31,64,209,232,42,64,123,161,160,62,189,30,32,63,90,13,149,63,218,225,191,63,56,243,223,63,152,47,1,64,96,200,16,64,145,126,27,64,89,76,44,64,215,163,52,64,168,81,192,62,82,71,19,63,21,140,74,63,159,142,111,63,136,104,140,63,52,244,171,63,55,108,231,63,227,252,11,64,24,67,33,64,154,119,44,64,38,171,114,62,232,49,170,62,225,98,245,62,153,46,88,63,120,127,172,63,62,208,190,63,89,139,215,63,69,129,2,64,53,12,19,64,235,86,29,64,230,36,4,62,51,51,83,62,29,2,35,63,66,119,93,63,157,133,145,63,101,165,173,63,227,54,218,63,197,85,245,63,207,44,33,64,140,103,48,64,232,218,71,62,235,116,136,62,192,95,212,62,231,169,158,63,244,248,185,63,190,222,205,63,98,161,234,63,40,15,3,64,39,78,30,64,175,206,39,64,94,213,41,62,70,211,89,62,1,218,190,62,53,64,9,63,201,200,129,63,255,120,171,63,44,14,199,63,2,14,249,63,54,31,15,64,134,56,28,64,3,147,131,62,68,220,188,62,231,200,34,63,117,115,77,63,106,217,138,63,22,53,184,63,19,73,232,63,154,182,7,64,84,82,29,64,0,198,39,64,244,134,91,62,20,34,152,62,248,226,227,62,140,185,51,63,153,187,174,63,22,246,236,63,56,74,4,64,103,68,13,64,113,32,30,64,14,50,39,64,139,113,174,62,231,55,8,63,97,110,111,63,252,227,149,63,179,94,176,63,165,189,209,63,248,141,251,63,22,193,15,64,186,102,40,64,19,155,51,64,0,253,158,62,89,248,210,62,71,29,21,63,33,205,68,63,201,32,95,63,63,87,143,63,163,146,246,63,216,71,13,64,195,13,26,64,140,190,40,64,88,85,127,62,169,20,227,62,21,172,33,63,116,98,79,63,179,65,154,63,15,185,173,63,72,191,205,63,244,248,253,63,51,80,13,64,123,73,41,64,47,134,18,62,110,194,61,62,115,130,166,62,37,6,1,63,80,54,145,63,244,248,169,63,42,58,214,63,13,113,0,64,247,233,24,64,240,191,47,64,71,3,104,62,115,15,153,62,144,106,232,62,237,128,127,63,65,130,178,63,172,115,204,63,134,27,4,64,186,73,14,64,231,58,27,64,8,114,36,64,147,86,60,62,22,167,130,62,50,232,212,62,167,206,31,63,102,107,133,63,135,254,153,63,27,18,199,63,20,5,8,64,86,159,25,64,230,92,42,64,193,28,141,62,40,96,187,62,30,168,39,63,184,119,125,63,198,220,149,63,65,72,186,63,190,246,4,64,191,43,16,64,3,38,32,64,155,230,43,64,239,60,81,62,74,96,147,62,137,36,202,62,59,228,66,63,82,39,192,63,97,113,228,63,194,192,247,63,247,199,9,64,71,90,22,64,196,235,34,64,141,154,175,62,204,12,7,63,13,223,106,63,55,142,148,63,153,240,191,63,165,131,225,63,231,24,6,64,215,81,19,64,179,152,34,64,205,117,44,64,33,59,79,62,20,175,170,62,6,218,245,62,219,107,53,63,20,203,81,63,37,122,141,63,251,63,231,63,95,7,250,63,1,24,39,64,61,10,51,64,110,51,157,62,59,168,188,62,134,60,26,63,239,230,141,63,167,232,180,63,122,170,195,63,231,53,230,63,214,57,254,63,183,209,10,64,17,252,27,64,223,135,19,62,139,168,73,62,75,35,198,62,251,173,81,63,47,23,165,63,75,2,208,63,29,114,243,63,7,182,8,64,205,233,30,64,97,79,45,64,147,0,53,62,122,137,137,62,53,126,41,63,132,71,135,63,226,35,198,63,212,14,219,63,76,137,252,63,135,254,15,64,153,216,34,64,179,181,48,64,185,0,68,62,33,2,150,62,185,0,252,62,70,239,76,63,3,91,133,63,135,167,163,63,177,22,235,63,229,213,1,64,1,246,15,64,140,45,40,64,179,240,165,62,221,92,204,62,189,251,47,63,99,99,94,63,90,240,130,63,153,129,202,63,245,74,237,63,62,174,253,63,165,131,35,64,243,84,43,64,17,172,106,62,82,13,155,62,108,124,246,62,34,81,52,63,121,178,119,63,192,4,234,63,42,58,6,64,198,138,16,64,158,36,35,64,252,24,45,64,224,42,239,62,179,96,50,63,18,131,112,63,162,40,140,63,110,134,163,63,43,135,190,63,78,185,242,63,95,36,10,64,247,88,30,64,71,61,42,64,199,160,51,62,235,167,111,62,196,63,188,62,95,122,3,63,245,99,63,63,64,19,129,63,253,164,202,63,39,102,3,64,37,64,23,64,246,151,43,64,77,15,210,62,228,219,15,63,150,120,60,63,79,233,116,63,74,94,145,63,242,234,164,63,253,19,224,63,226,6,248,63,58,175,9,64,89,81,31,64,50,115,81,62,75,35,142,62,83,148,7,63,161,20,57,63,242,152,153,63,112,66,185,63,196,153,219,63,247,228,245,63,222,229,22,64,183,122,32,64,108,152,129,62,70,178,159,62,106,109,50,63,98,248,168,63,93,167,201,63,237,71,218,63,17,83,0,64,125,203,10,64,113,143,29,64,46,144,42,64,179,149,39,62,149,156,115,62,81,104,201,62,137,7,28,63,146,177,90,63,119,132,139,63,191,96,195,63,204,209,235,63,123,20,8,64,142,117,43,64,112,178,229,62,153,217,7,63,90,14,80,63,131,47,140,63,243,147,154,63,9,167,201,63,203,45,241,63,249,49,2,64,132,100,35,64,237,13,44,64,216,130,134,62,97,112,173,62,83,63,3,63,0,116,128,63,138,118,189,63,81,160,207,63,242,12,234,63,105,29,9,64,62,208,22,64,232,188,32,64,147,143,213,62,252,253,34,63,83,174,132,63,212,241,168,63,158,7,215,63,62,203,239,63,212,183,4,64,43,246,15,64,166,126,32,64,206,170,41,64,109,3,135,62,252,27,236,62,140,101,30,63,191,153,84,63,98,132,128,63,218,85,148,63,217,153,230,63,73,75,1,64,174,158,19,64,248,141,47,64,248,138,198,62,71,58,19,63,149,211,58,63,216,215,110,63,126,58,174,63,21,169,192,63,171,38,224,63,208,97,4,64,13,166,21,64,126,53,31,64,194,221,57,62,96,5,136,62,101,197,232,62,110,139,138,63,63,198,164,63,58,35,202,63,119,243,236,63,152,52,6,64,67,231,29,64,77,103,41,64,128,42,142,62,112,179,176,62,5,51,26,63,7,240,150,63,191,130,176,63,224,214,197,63,145,44,232,63,38,54,251,63,167,121,31,64,89,134,42,64,169,159,55,62,175,8,126,62,19,242,233,62,152,251,56,63,62,63,144,63,107,43,202,63,189,82,230,63,142,175,249,63,210,251,30,64,108,67,45,64,208,238,160,62,112,37,195,62,141,208,27,63,216,68,58,63,249,245,99,63,168,29,206,63,2,183,8,64,248,136,16,64,23,43,38,64,9,109,45,64,131,22,66,62,17,58,136,62,184,230,214,62,90,213,38,63,31,128,180,63,110,81,210,63,106,106,237,63,26,163,17,64,191,125,31,64,105,53,46,64,94,73,130,62,132,70,160,62,38,26,24,63,233,154,129,63,237,42,216,63,39,189,247,63,165,160,7,64,118,108,18,64,74,70,34,64,93,191,42,64,112,236,9,62,32,8,48,62,189,0,155,62,27,98,252,62,249,72,102,63,25,86,157,63,191,241,221,63,7,211,0,64,214,144,28,64,97,137,47,64,4,29,109,62,49,234,186,62,90,70,46,63,207,158,99,63,100,64,142,63,13,224,165,63,58,117,197,63,73,99,252,63,37,93,27,64,55,113,40,64,152,221,99,62,100,120,156,62,31,246,6,63,63,1,48,63,118,55,151,63,59,252,213,63,17,141,238,63,250,155,4,64,250,155,40,64,143,223,49,64,124,15,55,62,235,28,115,62,249,20,192,62,43,80,91,63,37,59,214,63,162,40,232,63,22,19,1,64,84,111,17,64,71,114,33,64,248,25,47,64,65,45,70,62,28,151,137,62,119,20,231,62,122,227,64,63,100,31,124,63,89,134,164,63,97,195,215,63,216,42,241,63,22,222,5,64,49,148,15,64,31,187,243,62,234,207,38,63,224,17,77,63,236,76,129,63,54,229,158,63,42,140,173,63,80,83,227,63,123,131,5,64,92,119,17,64,18,20,29,64,157,188,88,62,144,221,157,62,73,189,215,62,243,175,93,63,65,154,181,63,66,67,199,63,144,160,228,63,22,77,1,64,179,181,12,64,92,114,40,64,16,174,80,62,90,73,251,62,68,76,129,63,135,51,163,63,97,113,188,63,171,178,231,63,196,235,10,64,159,2,28,64,45,96,42,64,147,111,50,64,30,138,50,62,153,18,129,62,31,186,44,63,7,154,87,63,48,13,135,63,129,149,163,63,89,110,217,63,14,132,4,64,113,143,25,64,85,19,42,64,219,253,122,62,192,233,165,62,123,250,32,63,130,139,109,63,32,210,143,63,188,63,202,63,71,119,240,63,145,126,3,64,69,245,22,64,109,255,34,64,7,7,59,62,153,242,129,62,76,194,197,62,198,50,29,63,108,178,174,63,101,223,197,63,37,146,2,64,80,1,14,64,15,209,26,64,156,249,39,64,138,89,151,62,127,79,188,62,200,209,48,63,124,15,135,63,130,226,151,63,86,125,210,63,232,217,248,63,254,125,6,64,198,249,35,64,197,61,44,64,216,45,98,62,234,66,148,62,41,235,35,63,80,115,82,63,143,112,146,63,172,173,200,63,185,25,226,63,243,60,244,63,23,159,6,64,17,223,35,64,100,145,206,62,119,187,6,63,185,113,59,63,196,177,102,63,99,151,132,63,206,112,171,63,201,89,228,63,37,146,248,63,245,190,23,64,9,27,40,64,204,238,89,62,73,99,132,62,251,115,241,62,36,128,47,63,59,194,161,63,43,24,233,63,7,124,10,64,37,117,18,64,35,50,40,64,55,113,50,64,153,103,205,62,150,93,36,63,250,39,132,63,218,56,158,63,189,227,184,63,33,229,215,63,26,110,0,64,232,159,14,64,115,157,36,64,92,85,46,64,237,45,117,62,123,163,174,62,222,57,252,62,61,39,53,63,34,165,97,63,233,241,131,63,98,16,220,63,20,5,22,64,82,15,37,64,180,113,48,64,92,147,150,62,110,250,195,62,70,209,19,63,22,48,129,63,178,17,168,63,159,171,181,63,89,81,223,63,221,7,6,64,162,127,18,64,42,116,30,64,93,225,45,62,174,155,114,62,44,127,206,62,45,149,35,63,234,149,150,63,236,18,173,63,102,49,213,63,4,115,244,63,145,155,9,64,224,214,45,64,107,127,87,62,157,74,142,62,172,170,231,62,89,139,179,63,19,184,193,63,195,71,220,63,78,180,243,63,242,210,17,64,83,92,37,64,67,144,47,64,94,103,35,62,138,202,102,62,250,125,191,62,175,209,54,63,164,112,129,63,49,148,175,63,19,126,217,63,67,144,239,63,90,187,1,64,168,111,31,64,123,103,132,62,34,168,14,63,43,217,81,63,93,249,132,63,146,150,166,63,142,1,185,63,110,81,234,63,107,72,6,64,39,136,20,64,228,160,34,64,151,87,110,62,6,130,144,62,12,201,33,63,207,16,102,63,213,202,196,63,154,66,239,63,22,24,4,64,101,1,15,64,0,227,31,64,151,139,40,64,153,131,20,63,100,121,127,63,56,21,169,63,235,173,189,63,101,165,221,63,171,4,243,63,182,185,7,64,125,145,18,64,255,236,33,64,204,180,41,64,150,236,88,62,75,59,157,62,205,30,232,62,119,17,114,63,223,26,160,63,211,193,190,63,159,176,220,63,139,253,17,64,71,3,36,64,153,42,48,64,201,232,160,62,62,179,252,62,195,243,42,63,6,129,101,63,100,88,169,63,126,198,189,63,80,112,213,63,120,185,252,63,180,89,27,64,67,144,35,64,124,213,58,62,99,239,133,62,138,5,214,62,224,132,134,63,58,117,161,63,89,192,184,63,31,46,213,63,35,50,248,63,205,117,28,64,93,220,40,64,32,94,119,62,116,38,157,62,194,138,251,62,197,143,141,63,171,4,199,63,135,80,213,63,3,67,246,63,15,156,5,64,194,134,23,64,184,233,41,64,97,165,66,62,179,123,130,62,209,122,232,62,20,122,57,63,138,171,138,63,253,106,178,63,50,56,242,63,226,175,5,64,183,151,20,64,197,254,30,64,45,237,156,62,238,151,199,62,109,199,56,63,127,247,86,63,207,247,143,63,216,129,211,63,113,85,233,63,233,125,17,64,198,109,36,64,186,218,42,64,54,171,62,62,243,2,140,62,236,50,196,62,251,147,16,63,190,106,193,63,158,41,236,63,164,199,255,63,34,108,12,64,76,224,24,64,123,160,37,64,60,248,153,62,253,216,244,62,252,199,82,63,152,81,144,63,122,170,203,63,102,136,239,63,157,46,11,64,179,205,25,64,101,252,39,64,215,18,50,64,145,96,106,62,154,120,183,62,232,46,1,63,102,190,75,63,40,184,128,63,185,136,147,63,251,58,244,63,143,252,7,64,140,214,23,64,141,11,51,64,159,2,48,62,14,49,126,62,119,157,221,62,220,72,85,63,226,59,133,63,24,120,162,63,159,176,212,63,171,149,245,63,103,44,10,64,78,209,41,64,93,83,16,62,25,85,70,62,249,160,175,62,23,243,15,63,4,231,136,63,214,139,197,63,60,136,233,63,5,23,251,63,38,170,29,64,135,80,49,64,206,52,49,62,63,141,123,62,231,167,184,62,16,235,117,63,184,117,203,63,249,78,216,63,77,248,253,63,233,38,9,64,47,168,37,64,2,154,48,64,191,241,117,62,138,34,220,62,69,47,35,63,91,94,73,63,232,217,136,63,63,0,157,63,204,69,188,63,198,220,249,63,221,123,12,64,13,108,39,64,104,88,188,62,124,156,241,62,240,23,59,63,118,137,138,63,18,247,156,63,74,65,187,63,70,206,246,63,171,91,3,64,7,8,26,64,191,101,42,64,113,27,125,62,44,103,183,62,194,51,9,63,7,41,72,63,185,141,174,63,139,79,209,63,80,83,231,63,47,52,255,63,47,250,28,64,112,119,38,64,205,34,228,62,21,26,48,63,40,155,142,63,39,136,166,63,62,232,201,63,194,105,241,63,195,100,14,64,28,240,27,64,92,56,42,64,183,180,48,64,202,136,91,62,120,11,172,62,35,192,249,62,210,112,66,63,222,115,120,63,145,15,146,63,202,137,186,63,52,244,207,63,148,164,19,64,252,198,45,64,119,45,193,62,34,253,238,62,181,83,55,63,78,185,138,63,77,214,160,63,131,163,180,63,11,12,229,63,249,218,247,63,15,40,13,64,181,253,35,64,53,236,23,62,68,190,91,62,161,134,11,63,225,38,87,63,10,191,152,63,68,134,189,63,255,91,229,63,193,86,5,64,74,70,26,64,183,69,43,64,62,3,26,62,47,138,142,62,208,236,74,63,179,7,122,63,71,3,156,63,232,222,179,63,43,53,227,63,191,101,10,64,35,16,35,64,177,196,47,64,228,248,113,62,150,66,168,62,128,128,33,63,171,4,87,63,186,107,133,63,95,65,166,63,29,90,208,63,105,116,235,63,171,33,19,64,10,157,31,64,201,255,172,62,95,239,254,62,64,22,54,63,32,181,89,63,123,245,125,63,196,153,159,63,219,249,218,63,42,140,5,64,253,188,33,64,28,66,45,64,33,89,48,62,139,55,114,62,91,236,190,62,248,111,6,63,200,94,151,63,103,44,222,63,235,168,246,63,239,85,7,64,72,109,20,64,232,188,34,64,186,162,212,62,90,243,31,63,252,23,104,63,98,21,143,63,113,27,185,63,142,175,213,63,128,101,249,63,124,15,11,64,56,74,32,64,145,237,42,64,189,228,135,62,228,129,208,62,40,40,29,63,95,8,81,63,105,229,122,63,198,249,147,63,47,221,224,63,36,151,17,64,246,209,31,64,87,149,45,64,139,137,141,62,23,185,239,62,208,70,38,63,85,18,81,63,85,251,152,63,174,129,173,63,43,77,198,63,237,182,247,63,149,241,13,64,164,83,27,64,142,117,65,62,132,212,141,62,212,72,211,62,72,49,44,63,106,106,173,63,203,219,193,63,70,153,217,63,79,64,9,64,205,117,24,64,86,130,37,64,0,116,120,62,234,120,180,62,170,184,105,63,252,0,172,63,246,93,205,63,173,163,230,63,82,242,0,64,66,91,12,64,233,125,29,64,176,114,40,64,19,124,67,62,192,89,146,62,129,236,229,62,219,164,66,63,6,76,116,63,148,106,151,63,109,168,216,63,140,103,240,63,191,183,17,64,74,210,29,64,111,244,97,62,159,202,153,62,240,192,56,63,165,130,114,63,173,47,166,63,187,15,200,63,255,91,225,63,45,178,241,63,131,105,32,64,184,35,44,64,182,72,90,62,132,244,148,62,102,250,49,63,199,13,107,63,136,104,176,63,12,229,208,63,169,135,236,63,77,50,0,64,95,239,22,64,110,163,39,64,109,60,168,62,26,106,4,63,52,244,111,63,162,40,176,63,91,148,201,63,57,214,225,63,152,192,3,64,108,91,14,64,119,103,37,64,244,108,48,64,29,115,126,62,87,232,187,62,222,232,15,63,107,41,64,63,235,28,103,63,63,227,146,63,251,150,209,63,98,190,244,63,208,126,26,64,202,195,38,64,228,18,159,62,167,174,244,62,73,185,43,63,17,197,112,63,135,138,181,63,197,32,200,63,212,14,231,63,22,77,7,64,72,22,24,64,16,64,34,64,45,91,131,62,85,19,212,62,156,54,15,63,194,53,123,63,253,135,152,63,118,108,176,63,208,213,214,63,49,182,236,63,167,232,36,64,160,108,48,64,135,53,149,62,131,133,171,62,196,9,64,63,64,19,165,63], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE+10240);
/* memory initializer */ allocate([127,246,183,63,121,204,204,63,154,206,230,63,23,212,251,63,18,131,38,64,237,245,46,64,170,240,71,62,84,28,143,62,110,76,231,62,35,44,38,63,74,37,84,63,108,4,206,63,197,27,245,63,140,214,5,64,42,116,20,64,205,59,34,64,169,163,99,62,177,77,170,62,17,140,243,62,152,105,47,63,218,225,131,63,58,93,222,63,172,226,245,63,231,53,24,64,231,58,45,64,176,85,52,64,251,201,40,62,240,218,117,62,213,63,184,62,56,75,77,63,68,192,193,63,142,35,210,63,225,151,2,64,255,236,15,64,53,70,31,64,171,178,45,64,128,238,91,62,223,27,147,62,204,152,18,63,167,145,146,63,118,253,174,63,37,88,224,63,2,183,2,64,101,54,14,64,85,193,34,64,59,170,44,64,127,134,103,62,212,39,169,62,171,233,242,62,216,16,48,63,133,151,76,63,132,240,168,63,171,231,248,63,151,255,4,64,9,138,23,64,156,138,32,64,178,104,122,62,151,201,200,62,194,190,13,63,225,209,58,63,224,185,159,63,132,100,185,63,48,13,207,63,231,198,4,64,97,195,21,64,229,39,33,64,20,151,51,62,227,226,160,62,32,93,228,62,171,34,76,63,250,10,170,63,19,73,184,63,126,140,229,63,212,67,248,63,210,0,30,64,131,47,46,64,85,191,82,62,234,91,150,62,34,167,231,62,174,129,137,63,184,228,164,63,175,235,211,63,143,194,237,63,21,87,23,64,166,242,40,64,186,20,51,64,151,2,130,62,208,9,201,62,232,107,22,63,149,213,76,63,116,239,121,63,106,193,151,63,95,12,201,63,246,35,233,63,36,209,5,64,88,86,22,64,156,25,165,62,15,99,210,62,209,59,57,63,13,195,135,63,104,203,153,63,255,62,179,63,230,34,202,63,22,246,228,63,146,116,29,64,96,118,39,64,29,86,88,62,120,38,156,62,213,60,223,62,90,160,69,63,163,204,190,63,131,192,214,63,252,111,241,63,150,67,7,64,235,226,20,64,110,139,46,64,252,166,112,62,163,86,208,62,141,98,93,63,55,79,165,63,63,169,218,63,104,34,248,63,123,131,11,64,185,141,22,64,35,21,36,64,102,136,45,64,187,14,53,62,144,136,137,62,191,68,228,62,137,183,82,63,213,207,131,63,206,194,162,63,62,203,207,63,15,214,231,63,169,188,25,64,144,78,39,64,117,171,119,62,137,180,173,62,28,236,1,63,150,120,128,63,36,40,154,63,12,176,175,63,207,107,248,63,217,124,6,64,214,173,24,64,244,224,42,64,72,107,108,62,111,99,171,62,64,24,0,63,7,67,97,63,75,205,130,63,147,82,196,63,217,66,252,63,11,65,8,64,253,77,36,64,20,232,45,64,147,82,152,62,181,52,231,62,129,180,63,63,27,16,125,63,244,224,174,63,93,167,205,63,56,132,242,63,174,42,11,64,28,95,33,64,62,150,48,64,32,12,76,62,132,211,138,62,212,14,255,62,62,204,90,63,95,7,150,63,120,156,174,63,214,139,225,63,36,11,252,63,72,27,11,64,191,241,19,64,82,129,99,62,198,135,217,62,10,160,16,63,93,110,84,63,193,226,132,63,161,214,152,63,159,60,220,63,229,213,237,63,245,161,27,64,21,116,47,64,252,83,58,62,61,67,104,62,82,241,199,62,60,108,14,63,171,62,135,63,172,202,198,63,227,54,8,64,102,131,16,64,92,143,38,64,239,85,51,64,89,23,183,62,236,166,16,63,213,149,147,63,245,214,172,63,89,76,196,63,30,249,219,63,36,156,250,63,239,56,11,64,146,92,32,64,97,108,43,64,179,38,38,62,204,125,114,62,10,130,191,62,207,16,18,63,40,127,63,63,158,12,150,63,216,100,233,63,216,100,3,64,156,225,32,64,152,105,49,64,8,145,156,62,131,134,238,62,166,38,37,63,90,245,97,63,202,21,146,63,120,40,162,63,96,205,217,63,48,47,0,64,159,200,11,64,236,81,26,64,47,54,109,62,23,240,194,62,87,181,12,63,128,96,86,63,166,213,156,63,195,158,170,63,147,0,237,63,194,163,7,64,69,42,20,64,228,218,46,64,139,25,113,62,166,211,146,62,165,79,47,63,91,95,172,63,157,104,195,63,162,11,218,63,208,126,6,64,140,74,16,64,132,240,36,64,239,3,46,64,158,123,111,62,157,157,228,62,134,230,26,63,42,141,80,63,238,8,135,63,235,226,150,63,99,11,209,63,72,196,236,63,154,235,8,64,180,229,46,64,13,29,139,62,11,153,171,62,59,115,91,63,141,122,160,63,113,143,177,63,181,224,217,63,92,201,242,63,37,59,12,64,82,184,30,64,175,124,38,64,81,21,115,62,145,12,161,62,248,109,224,62,148,131,105,63,10,244,201,63,108,91,240,63,59,25,2,64,78,156,12,64,115,99,26,64,176,85,34,64,3,235,184,62,194,247,18,63,48,13,131,63,119,248,187,63,69,100,216,63,97,108,245,63,223,253,11,64,191,96,21,64,137,210,42,64,65,154,51,64,238,148,142,62,233,39,204,62,139,198,18,63,153,214,86,63,58,117,137,63,114,109,156,63,248,136,216,63,159,147,10,64,124,39,24,64,62,92,34,64,244,112,146,62,79,89,229,62,146,116,29,63,75,117,89,63,101,228,168,63,151,86,187,63,185,141,226,63,224,16,0,64,159,31,12,64,7,211,28,64,225,180,96,62,114,107,154,62,11,37,43,63,168,112,92,63,72,225,154,63,107,212,191,63,24,96,223,63,196,90,240,63,205,30,20,64,135,167,39,64,10,245,100,62,102,77,180,62,165,77,25,63,210,227,155,63,85,246,173,63,35,190,203,63,20,179,226,63,226,175,13,64,69,240,35,64,31,17,47,64,0,26,53,62,136,71,114,62,119,75,202,62,62,119,34,63,51,22,145,63,54,229,170,63,124,155,226,63,145,155,253,63,71,56,13,64,249,189,21,64,99,98,171,62,174,245,205,62,60,191,40,63,126,25,72,63,139,168,121,63,184,30,213,63,253,159,239,63,187,10,3,64,131,134,30,64,23,188,36,64,183,38,93,62,104,203,145,62,168,52,6,63,195,13,72,63,14,219,170,63,89,221,226,63,189,24,250,63,240,109,12,64,12,2,37,64,242,123,47,64,193,172,152,62,108,209,250,62,201,31,80,63,39,131,151,63,177,138,191,63,150,9,215,63,106,246,6,64,133,66,20,64,54,31,43,64,199,128,54,64,24,64,160,62,87,181,212,62,248,53,30,63,40,43,102,63,7,182,138,63,112,182,161,63,83,150,241,63,76,142,15,64,69,216,26,64,191,130,36,64,155,86,122,62,27,187,220,62,177,252,25,63,225,41,80,63,148,19,141,63,178,75,156,63,224,161,216,63,75,31,2,64,249,49,14,64,117,171,39,64,96,146,26,62,68,81,96,62,146,204,178,62,237,127,28,63,190,222,137,63,6,18,160,63,194,47,245,63,238,95,5,64,205,204,28,64,250,184,50,64,91,125,37,62,25,56,96,62,116,8,228,62,110,136,109,63,72,191,185,63,230,92,226,63,21,82,8,64,87,120,23,64,190,159,42,64,101,25,52,64,57,180,72,62,240,49,152,62,166,153,254,62,92,32,49,63,48,129,139,63,242,7,163,63,148,193,193,63,1,106,0,64,157,133,17,64,65,159,36,64,63,168,171,62,82,237,235,62,106,104,47,63,58,31,94,63,135,196,129,63,229,97,189,63,114,196,0,64,96,200,10,64,34,166,36,64,129,236,45,64,172,228,131,62,198,134,174,62,38,224,255,62,66,210,87,63,39,194,178,63,209,116,234,63,211,48,2,64,176,230,10,64,53,12,27,64,141,151,34,64,237,215,213,62,69,184,33,63,171,150,116,63,200,65,153,63,84,116,212,63,232,159,240,63,159,205,10,64,173,250,22,64,109,255,36,64,33,176,44,64,246,240,37,62,125,207,128,62,147,58,225,62,119,49,41,63,31,102,103,63,151,255,168,63,35,248,207,63,130,168,227,63,52,244,33,64,115,46,51,64,73,131,131,62,111,70,165,62,105,116,47,63,119,16,139,63,41,179,161,63,212,241,200,63,222,2,237,63,241,244,0,64,2,241,16,64,208,155,28,64,85,50,0,62,44,102,52,62,227,25,172,62,240,22,72,63,207,160,153,63,240,80,184,63,1,24,231,63,22,246,4,64,28,153,29,64,129,62,47,64,83,123,209,61,234,233,67,62,77,73,70,63,72,191,137,63,119,74,175,63,116,70,208,63,151,139,252,63,160,26,15,64,235,255,38,64,221,7,52,64,200,154,49,62,118,52,110,62,225,181,251,62,172,26,88,63,211,48,140,63,96,118,175,63,80,54,217,63,77,74,3,64,84,58,20,64,150,33,32,64,26,219,131,62,20,236,175,62,50,113,39,63,185,199,86,63,36,40,134,63,107,101,190,63,64,217,220,63,169,222,242,63,122,141,27,64,6,129,37,64,76,166,74,62,196,120,141,62,198,108,225,62,161,129,52,63,50,56,162,63,39,194,222,63,10,157,247,63,77,219,9,64,224,156,25,64,233,241,39,64,200,181,209,62,231,198,24,63,27,215,123,63,61,68,151,63,216,129,175,63,253,77,192,63,82,15,225,63,64,48,1,64,189,82,24,64,201,229,37,64,246,97,109,62,143,112,170,62,38,143,247,62,134,3,37,63,84,26,81,63,133,34,109,63,86,159,179,63,163,233,14,64,107,241,29,64,227,107,43,64,136,104,132,62,222,28,174,62,232,164,43,63,75,145,104,63,42,198,141,63,19,102,186,63,235,57,225,63,173,81,247,63,92,61,7,64,43,217,19,64,83,205,60,62,18,47,127,62,42,85,210,62,19,129,22,63,82,184,166,63,42,82,193,63,31,186,220,63,146,174,253,63,9,27,18,64,46,4,27,64,181,26,130,62,135,108,160,62,133,236,40,63,100,6,162,63,140,219,180,63,50,61,213,63,218,172,246,63,215,134,6,64,245,74,35,64,236,18,43,64,96,120,37,62,245,45,115,62,50,201,192,62,152,24,35,63,247,177,82,63,52,157,145,63,74,36,217,63,59,25,240,63,19,213,25,64,137,239,40,64,81,221,196,62,252,1,239,62,123,164,61,63,221,38,112,63,22,251,135,63,22,48,193,63,210,227,223,63,120,122,245,63,14,21,35,64,5,250,42,64,69,241,170,62,69,183,214,62,28,149,35,63,249,218,139,63,98,161,194,63,45,33,211,63,103,237,238,63,60,136,9,64,169,48,22,64,153,100,32,64,252,56,218,62,9,223,47,63,81,49,158,63,143,228,182,63,149,72,206,63,112,124,229,63,50,32,1,64,69,245,14,64,170,14,35,64,66,149,44,64,64,161,134,62,36,42,188,62,50,202,7,63,255,234,61,63,117,90,95,63,167,232,136,63,214,110,223,63,137,234,3,64,111,42,18,64,165,160,31,64,158,235,171,62,169,23,12,63,155,89,55,63,161,72,107,63,207,73,163,63,195,71,180,63,3,178,215,63,111,211,251,63,208,237,13,64,104,150,28,64,148,23,105,62,167,119,169,62,232,221,248,62,137,12,143,63,150,9,167,63,241,75,193,63,229,237,224,63,80,54,249,63,45,9,40,64,30,22,50,64,66,62,184,62,92,142,223,62,141,41,64,63,20,203,153,63,126,53,171,63,184,35,204,63,207,49,252,63,40,73,7,64,78,185,36,64,170,183,46,64,182,244,88,62,143,169,155,62,28,68,3,63,78,236,41,63,132,13,139,63,245,16,209,63,225,180,232,63,10,75,8,64,116,7,25,64,4,115,38,64,87,204,72,62,63,56,143,62,54,117,222,62,6,243,31,63,65,185,69,63,185,194,179,63,159,113,249,63,131,76,10,64,236,81,40,64,141,156,49,64,9,137,52,62,39,105,134,62,25,88,191,62,9,195,20,63,247,146,194,63,210,58,222,63,21,116,247,63,140,248,8,64,154,235,22,64,172,57,48,64,114,134,130,62,77,72,195,62,69,98,78,63,215,23,141,63,39,107,196,63,45,9,224,63,116,70,252,63,79,59,10,64,203,45,29,64,100,35,42,64,73,244,66,62,184,202,147,62,251,235,229,62,208,156,45,63,224,247,79,63,165,131,185,63,187,68,221,63,96,176,251,63,67,226,40,64,253,135,50,64,103,154,128,62,130,228,197,62,55,255,27,63,224,14,76,63,173,23,131,63,238,66,151,63,77,50,186,63,238,206,0,64,201,142,31,64,69,187,44,64,89,167,42,62,198,78,136,62,34,53,197,62,250,68,54,63,99,238,178,63,11,36,196,63,129,62,245,63,203,161,5,64,98,45,36,64,169,135,50,64,6,45,116,62,192,176,156,62,212,11,230,62,177,83,96,63,140,190,194,63,168,140,247,63,86,154,8,64,192,38,17,64,10,104,34,64,197,32,42,64,98,131,37,62,114,50,97,62,107,215,180,62,138,59,6,63,235,56,118,63,62,150,154,63,195,13,216,63,74,94,245,63,20,92,10,64,178,133,20,64,244,196,211,62,56,219,24,63,13,52,75,63,128,125,124,63,178,17,164,63,11,210,180,63,207,131,211,63,158,7,1,64,20,150,24,64,65,212,33,64,137,36,106,62,55,225,174,62,49,68,246,62,56,21,125,63,238,124,175,63,25,28,189,63,59,54,238,63,176,3,1,64,119,190,21,64,74,123,49,64,181,167,132,62,199,213,24,63,164,55,124,63,199,46,169,63,75,89,210,63,26,139,250,63,188,121,18,64,140,214,31,64,249,218,45,64,204,11,54,64,143,27,62,62,235,252,155,62,133,120,228,62,140,75,93,63,198,191,139,63,229,10,163,63,34,166,248,63,84,29,6,64,222,147,33,64,216,42,49,64,112,237,52,62,76,107,131,62,13,227,62,63,50,86,111,63,63,82,164,63,227,83,184,63,98,243,225,63,83,208,7,64,161,214,24,64,146,203,37,64,62,92,66,62,75,32,141,62,25,202,225,62,99,68,82,63,67,197,160,63,254,154,180,63,8,3,247,63,96,176,7,64,142,88,25,64,108,178,38,64,6,157,136,62,113,229,172,62,185,196,81,63,125,63,145,63,129,4,165,63,184,117,227,63,87,207,253,63,39,49,14,64,80,199,37,64,172,173,44,64,191,70,82,62,251,146,141,62,118,253,6,63,172,55,58,63,187,39,131,63,158,181,211,63,44,188,243,63,169,251,2,64,103,242,13,64,137,41,29,64,95,69,150,62,71,87,217,62,171,33,29,63,240,196,116,63,66,38,145,63,12,147,169,63,76,142,231,63,13,26,250,63,112,206,18,64,56,219,36,64,207,131,59,62,64,164,127,62,208,157,192,62,243,61,11,63,255,231,172,63,201,31,244,63,87,236,5,64,141,93,16,64,196,235,32,64,142,6,44,64,105,140,10,63,18,48,74,63,172,139,135,63,91,124,162,63,204,127,192,63,93,225,217,63,220,46,252,63,105,58,11,64,188,203,31,64,77,190,41,64,111,212,106,62,171,207,173,62,242,92,231,62,15,69,41,63,165,187,75,63,71,114,137,63,2,188,1,64,43,53,13,64,76,166,30,64,144,131,46,64,140,246,168,62,26,194,1,63,181,78,44,63,10,45,99,63,86,72,157,63,146,179,172,63,80,1,228,63,135,138,5,64,210,198,17,64,208,184,30,64,217,181,13,62,16,205,76,62,118,226,202,62,152,221,79,63,99,156,139,63,183,238,186,63,55,108,223,63,31,191,243,63,186,73,22,64,255,202,44,64,112,210,52,62,14,249,119,62,155,172,193,62,202,195,150,63,191,72,200,63,70,206,214,63,175,206,249,63,46,197,7,64,134,32,37,64,35,45,47,64,58,90,21,62,102,47,75,62,136,217,171,62,229,237,12,63,131,134,130,63,39,131,175,63,189,24,230,63,108,207,248,63,132,71,13,64,42,198,47,64,242,40,197,62,57,242,0,63,121,7,52,63,111,245,136,63,145,208,174,63,34,108,188,63,204,180,233,63,139,55,10,64,13,195,23,64,147,87,33,64,247,228,145,62,125,174,198,62,210,225,1,63,86,14,97,63,8,3,195,63,213,91,227,63,34,253,246,63,119,21,10,64,222,171,28,64,148,135,37,64,142,115,251,62,96,147,65,63,101,170,160,63,248,223,194,63,249,102,227,63,184,204,1,64,207,78,18,64,90,129,27,64,138,118,43,64,155,172,49,64,170,68,129,62,33,203,202,62,156,136,54,63,101,139,92,63,242,123,147,63,96,118,175,63,225,151,206,63,103,68,9,64,144,189,36,64,23,154,45,64,101,197,144,62,209,122,224,62,169,18,29,63,226,5,89,63,233,96,161,63,10,133,176,63,156,51,210,63,117,205,8,64,96,147,23,64,18,107,33,64,198,221,80,62,190,246,164,62,218,173,245,62,134,0,116,63,57,11,155,63,138,229,178,63,241,128,230,63,182,45,250,63,158,210,25,64,170,183,36,64,223,112,135,62,90,131,183,62,241,246,32,63,29,61,142,63,80,141,171,63,86,212,192,63,145,242,255,63,76,108,12,64,190,135,29,64,7,182,42,64,218,254,53,62,95,12,101,62,218,2,202,62,158,97,14,63,202,137,114,63,249,20,192,63,80,228,221,63,206,136,246,63,237,187,16,64,62,232,27,64,214,225,160,62,127,46,186,62,189,86,58,63,207,20,90,63,59,228,134,63,32,41,230,63,128,183,252,63,184,175,11,64,152,110,34,64,173,76,40,64,228,158,78,62,86,14,141,62,224,77,207,62,239,89,63,63,163,1,192,63,201,171,235,63,253,217,255,63,14,132,14,64,237,216,30,64,64,217,42,64,0,86,7,62,200,65,161,62,14,76,82,63,215,23,153,63,128,154,182,63,78,151,217,63,234,91,2,64,57,180,20,64,190,222,43,64,174,13,53,64,39,188,100,62,229,213,177,62,152,250,1,63,45,7,70,63,88,201,119,63,44,43,145,63,50,230,254,63,216,158,19,64,246,93,33,64,225,122,50,64,184,31,160,62,23,74,230,62,76,82,21,63,246,41,111,63,128,96,162,63,73,186,174,63,211,222,200,63,65,241,215,63,124,242,4,64,207,20,38,64,169,137,254,61,92,4,38,62,144,218,148,62,147,110,39,63,9,167,157,63,66,236,196,63,30,80,242,63,111,211,11,64,75,2,36,64,9,22,51,64,85,76,53,62,203,216,128,62,54,92,188,62,221,153,105,63,200,94,199,63,221,181,216,63,27,18,243,63,241,157,4,64,5,105,22,64,184,88,41,64,23,74,118,62,221,180,193,62,54,61,12,63,248,23,65,63,145,43,121,63,15,69,141,63,152,134,201,63,146,203,1,64,39,131,13,64,113,3,36,64,242,7,219,62,97,221,4,63,222,114,69,63,246,238,111,63,93,22,139,63,140,16,206,63,225,122,240,63,233,96,3,64,6,47,34,64,191,14,42,64,64,193,101,62,213,204,162,62,231,27,225,62,63,28,80,63,12,2,179,63,105,53,208,63,177,167,229,63,199,75,7,64,71,201,19,64,58,204,31,64,240,79,169,59,95,210,24,189,2,126,13,187,234,6,138,60,135,134,5,62,21,145,33,61,227,194,1,61,82,101,152,189,24,5,1,189,153,244,119,61,108,146,159,60,91,97,250,188,78,43,69,189,207,132,102,189,165,249,227,188,224,161,168,60,206,165,56,188,50,229,195,60,102,249,186,187,109,228,58,60,148,49,190,188,94,17,220,61,14,188,26,189,162,93,133,59,176,140,141,188,180,58,185,189,91,97,250,59,9,193,202,61,108,64,68,189,235,228,140,188,90,245,185,60,167,203,130,189,107,98,65,61,184,148,51,61,170,96,20,189,106,247,171,58,214,170,253,189,226,177,31,189,194,75,112,61,244,168,152,61,36,211,33,61,247,228,225,61,81,159,100,60,207,45,244,189,92,170,18,189,29,30,66,189,129,120,221,60,138,146,144,187,2,188,5,189,153,42,24,189,12,64,35,59,162,38,58,189,233,14,34,62,201,1,187,60,155,198,246,188,167,4,68,189,106,191,181,61,121,144,30,188,61,127,218,61,209,150,179,61,134,228,228,188,109,145,52,61,213,120,233,188,61,124,153,60,232,75,143,189,141,211,16,189,248,56,83,189,39,133,249,188,236,160,146,188,129,92,226,60,181,109,152,188,116,11,253,189,10,132,157,60,100,117,107,61,95,206,236,188,109,29,156,60,57,68,28,61,98,74,164,189,94,44,12,61,94,20,189,60,129,150,174,60,148,164,43,61,176,57,231,61,150,92,197,60,113,117,192,61,102,245,238,189,103,101,123,60,241,73,135,189,195,128,197,189,93,106,132,59,108,6,184,188,185,25,238,189,219,221,67,61,187,123,128,187,68,137,150,189,0,111,1,59,58,235,211,188,176,3,231,60,229,68,251,61,222,28,46,60,206,28,18,189,90,183,161,61,7,178,30,188,227,197,66,58,188,31,23,190,250,180,138,60,80,57,166,188,105,113,198,189,129,149,115,190,42,143,238,188,29,88,142,60,91,95,36,189,140,161,92,189,232,193,29,62,186,131,88,188,86,72,121,60,31,214,155,188,212,152,144,189,78,40,4,61,142,59,37,61,190,164,209,61,210,85,186,188,215,250,162,60,125,34,79,61,158,234,16,60,24,208,11,189,196,7,54,61,6,74,74,189,64,218,15,190,149,159,148,61,108,94,85,60,89,50,199,187,50,231,25,61,143,198,161,59,255,233,166,189,151,56,114,59,85,108,76,61,54,2,241,59,191,73,211,57,137,10,213,60,250,180,10,188,142,59,165,61,177,107,123,61,135,51,223,189,205,88,180,189,21,29,73,188,79,3,166,189,100,145,166,60,71,203,161,189,43,191,140,61,255,179,102,188,198,134,46,189,38,54,191,61,44,183,52,61,249,219,158,57,36,211,129,61,151,200,197,61,138,232,215,189,117,233,31,61,24,151,42,60,156,79,93,189,56,249,173,189,231,171,164,61,13,250,18,189,237,185,12,62,139,25,129,61,26,26,79,61,175,66,202,60,255,150,0,189,155,114,5,62,232,247,125,188,239,141,161,189,104,118,157,189,213,37,99,188,200,180,150,189,113,203,71,61,77,244,121,59,219,249,254,188,18,23,64,61,202,221,231,60,67,113,71,61,106,251,7,62,166,10,134,61,164,168,115,61,110,167,45,189,58,63,53,190,16,61,105,61,229,126,135,187,150,64,74,189,166,70,40,189,21,145,33,189,205,118,133,188,43,24,149,187,51,254,125,61,36,12,163,189,153,128,95,189,236,222,10,188,105,227,136,188,9,136,73,61,113,2,211,60,134,57,161,189,53,154,188,61,171,180,197,61,36,72,133,189,213,89,173,60,88,254,156,61,46,200,22,60,206,0,23,189,189,166,135,188,143,23,82,60,39,194,6,60,80,0,69,187,104,64,221,61,153,158,48,61,210,82,121,189,129,123,158,188,24,178,186,60,15,126,226,186,123,50,127,61,47,250,138,188,223,167,170,186,119,103,109,188,159,57,43,189,103,128,11,189,171,203,73,190,211,217,9,189,44,69,2,190,37,148,222,189,253,49,45,188,103,44,154,187,3,210,126,188,242,68,176,189,225,181,11,61,203,159,207,189,72,135,7,59,153,43,131,187,73,213,54,189,18,135,140,189,7,237,85,61,132,214,67,189,174,98,49,189,62,38,18,61,63,225,44,61,162,39,101,189,137,37,101,61,229,122,219,188,109,116,78,188,191,72,104,189,83,205,172,188,177,195,216,61,230,178,209,188,78,128,161,189,148,248,92,188,73,185,251,60,75,228,2,189,108,203,0,61,121,121,186,60,42,200,207,60,189,142,248,61,9,222,144,61,178,43,173,189,23,242,200,61,228,18,199,188,58,64,112,189,49,236,48,189,118,139,64,188,181,83,51,189,242,120,186,61,212,209,145,189,64,222,171,188,147,201,169,61,197,170,1,189,216,186,180,189,186,158,136,61,44,42,162,189,253,20,71,188,3,68,65,60,124,125,45,188,188,36,206,61,170,157,193,61,34,82,19,61,163,145,207,60,131,25,147,61,183,152,31,60,49,178,36,189,47,252,224,59,5,81,119,188,35,131,44,190,183,235,101,189,155,90,118,61,61,184,59,61,158,63,141,189,89,133,13,61,21,199,129,60,165,18,190,189,15,12,96,61,232,18,14,62,243,58,226,58,227,251,226,59,240,79,169,59,114,21,139,60,38,253,61,61,115,130,118,189,21,225,38,189,139,223,148,189,218,58,184,188,34,136,243,188,40,40,133,189,54,120,255,189,96,5,56,61,242,8,238,188,203,46,24,189,81,130,254,60,189,28,118,61,238,147,35,60,42,141,24,60,140,247,227,187,148,20,216,189,237,69,116,61,175,68,160,188,83,148,139,189,69,19,136,189,251,115,81,58,130,30,234,60,247,200,198,61,98,134,198,61,232,164,247,60,217,208,13,189,164,26,182,189,68,53,37,61,138,62,159,60,37,178,79,189,38,224,87,187,81,131,233,188,160,138,91,189,15,214,127,61,223,196,144,189,156,225,134,188,49,37,18,189,79,92,142,60,69,103,25,60,157,185,71,61,239,168,49,61,250,37,34,61,9,81,190,188,153,72,137,189,102,191,46,61,129,120,93,61,232,75,47,189,161,18,183,189,216,212,249,188,229,209,77,189,162,211,115,61,75,116,182,61,232,192,242,188,248,83,131,61,174,98,177,189,81,102,3,187,25,28,165,61,166,152,3,58,124,184,100,187,25,88,199,61,188,232,203,61,60,48,128,60,45,64,219,59,102,16,159,61,1,194,135,60,201,3,17,61,194,133,60,189,156,52,141,60,77,49,71,189,191,153,24,60,223,223,16,62,66,233,139,60,111,99,51,61,10,15,218,189,46,116,21,62,199,128,108,61,236,81,56,60,129,122,115,189,173,222,225,60,26,81,218,60,213,180,11,60,3,68,65,59,88,86,26,189,191,185,159,189,104,149,185,189,20,34,96,59,251,116,60,189,211,249,240,59,84,27,156,60,22,189,3,190,131,223,134,60,97,53,150,59,88,254,252,188,172,142,188,189,76,165,31,61,187,155,167,189,99,151,136,61,150,231,65,189,92,58,102,59,209,89,38,61,22,193,63,61,241,189,191,188,156,139,127,61,238,63,178,60,206,53,204,60,79,2,155,188,241,161,68,189,147,169,130,61,22,49,108,188,250,41,78,189,179,154,46,61,132,98,235,189,5,197,207,189,119,133,126,61,17,252,239,60,198,250,134,189,183,70,228,61,189,255,79,61,8,4,186,188,248,169,10,62,144,133,104,59,139,195,9,62,59,171,69,189,218,30,189,189,188,35,227,188,193,225,133,60,190,250,120,189,133,234,166,189,38,87,177,187,51,222,214,188,93,197,18,190,148,165,86,61,106,78,158,189,205,31,19,189,163,230,43,189,39,79,217,189,212,41,143,187,102,45,133,61,162,93,197,61,13,80,90,189,43,109,49,61,237,182,75,189,208,10,76,61,44,102,4,61,99,41,82,61,174,102,29,188,232,219,82,190,250,151,164,59,116,122,94,189,76,142,187,188,244,107,203,61,227,251,226,187,212,210,156,189,141,96,227,189,153,97,227,61,101,53,29,61,112,68,119,189,54,143,131,61,239,142,12,189,37,236,219,60,177,220,210,60,211,250,155,189,115,214,39,190,18,49,101,61,63,0,105,189,185,253,114,60,109,57,247,189,180,61,186,61,51,139,16,61,16,65,21,189,37,207,117,61,96,117,164,61,46,86,20,61,203,161,133,61,162,11,170,61,126,199,112,189,4,175,214,61,123,49,84,189,149,216,53,188,221,94,210,187,145,66,89,61,252,165,197,60,119,130,189,61,12,230,111,61,123,250,8,189,223,82,206,60,78,70,149,188,196,35,241,61,26,163,53,61,88,230,45,189,7,69,51,189,234,32,175,188,201,200,249,189,38,57,224,60,118,252,87,61,189,109,166,188,10,49,23,61,74,64,236,61,73,46,255,60,48,45,42,61,244,193,114,61,27,127,34,189,16,2,178,189,15,68,38,190,119,43,203,60,19,242,1,61,159,205,170,61,19,41,13,189,57,155,142,57,255,122,5,188,222,30,4,187,176,30,7,62,31,72,190,189,35,77,188,189,215,190,128,189,236,20,171,187,92,89,130,61,128,99,79,188,119,214,46,61,107,42,139,61,44,73,30,61,247,229,28,190,147,84,198,61,222,203,221,61,119,47,183,61,10,47,65,189,153,126,137,59,201,57,49,189,80,58,17,189,130,59,80,61,242,68,144,61,252,251,172,61,142,204,163,189,37,92,72,189,25,114,108,61,90,189,195,60,139,136,226,60,224,156,145,60,34,80,125,60,113,28,248,188,37,59,182,188,227,82,85,61,218,145,26,190,126,196,47,187,219,139,104,189,80,167,252,189,133,233,187,189,241,43,214,59,118,27,212,59,37,117,18,190,159,2,96,61,243,230,48,189,141,11,7,61,111,214,224,60,45,176,7,61,71,232,7,190,17,172,42,188,229,9,164,189,231,252,148,188,34,136,243,58,3,236,227,61,157,218,185,189,17,113,115,61,130,198,140,189,233,181,185,61,59,141,20,190,243,175,133,189,161,19,130,61,112,123,130,187,208,240,102,189,183,182,112,187,96,205,129,60,164,80,150,189,48,242,50,61,47,220,57,59,127,190,141,61,104,178,255,61,187,94,90,189,254,182,39,189,217,66,144,61,102,47,219,189,57,71,157,188,167,235,9,189,98,190,188,186,65,154,177,60,162,127,226,61,124,240,90,189,165,188,86,189,142,63,17,61,165,215,230,188,55,223,72,189,177,249,184,60,53,11,52,188,8,232,62,187,241,185,83,189,127,103,155,189,5,138,24,61,139,107,156,61,74,70,14,61,221,64,1,189,142,143,150,61,45,10,187,186,48,127,133,60,193,169,143,188,145,72,91,59,80,86,204,189,116,126,138,189,212,70,53,189,92,28,149,188,253,218,250,60,216,69,81,60,146,92,62,61,106,106,249,189,180,142,106,189,65,239,237,61,0,171,163,189,160,250,135,61,218,57,77,61,88,228,87,188,11,156,108,61,197,28,68,189,43,79,224,189,189,1,22,190,57,214,5,61,172,1,74,189,5,168,105,189,177,250,163,189,55,139,183,61,229,185,62,189,200,177,245,188,67,59,39,61,181,222,239,60,61,16,25,189,198,110,31,188,163,59,168,189,206,227,240,189,17,198,239,61,61,16,25,61,69,245,86,58,237,98,218,189,5,136,2,188,102,220,84,58,37,3,16,62,123,160,21,61,151,114,126,61,246,38,134,189,169,106,194,189,2,127,248,61,19,155,143,60,165,247,141,188,145,124,37,189,130,139,149,188,202,23,52,60,93,194,161,60,230,205,225,188,146,147,9,61,212,240,45,61,202,250,77,187,252,142,97,60,10,102,172,61,150,64,10,61,176,140,141,188,22,136,30,188,76,107,211,187,195,182,5,61,62,119,2,61,72,191,253,188,108,179,49,189,79,7,178,187,177,252,121,188,202,52,90,61,112,63,96,61,79,148,132,189,197,200,18,60,195,156,16,190,235,253,6,189,233,13,119,188,249,19,149,60,0,85,220,186,77,131,18,62,227,165,155,61,242,235,135,58,202,167,71,189,94,187,180,60,222,60,213,60,137,97,7,188,243,62,78,189,23,184,188,188,232,104,21,189,251,229,83,189,121,33,13,62,220,14,13,189,238,38,248,187,234,117,139,187,186,132,131,61,139,249,153,61,239,198,194,61,61,16,217,60,237,240,215,60,110,106,32,60,77,186,109,189,212,96,90,61,133,94,159,189,193,83,8,189,127,50,166,189,94,46,98,189,148,218,139,59,243,173,143,60,28,40,240,187,142,6,240,189,33,234,190,61,192,5,25,61,121,32,50,59,147,28,48,60,9,194,149,60,8,61,155,189,4,228,203,188,214,110,187,59,224,71,181,60,240,222,17,61,210,56,20,61,98,20,4,61,103,240,215,61,161,18,151,189,155,86,138,60,91,125,117,189,26,162,74,189,167,145,150,61,162,241,196,188,139,78,214,189,156,250,192,60,57,184,116,189,20,178,51,189,143,197,182,60,111,18,131,185,120,155,151,189,247,91,75,62,40,101,210,61,22,134,200,60,40,11,159,61,154,238,117,189,252,84,149,188,83,61,25,190,250,185,33,188,52,185,216,189,151,139,248,59,130,85,37,190,126,110,40,189,226,204,175,188,159,200,19,60,40,40,133,189,236,247,228,61,60,106,204,188,189,196,152,61,239,83,213,188,56,188,128,189,103,183,22,60,42,143,142,61,201,30,161,61,30,221,8,189,82,181,93,61,152,53,177,59,244,78,133,188,165,77,85,61,162,98,220,61,225,70,138,189,93,109,197,189,40,12,10,61,67,28,107,188,83,37,202,188,152,106,102,61,44,72,51,189,180,58,121,189,83,34,137,187,98,161,150,61,38,223,108,189,255,88,136,188,188,90,238,60,112,148,188,59,207,219,216,60,218,173,37,61,72,80,188,189,200,207,70,189,233,15,13,189,153,14,221,189,55,199,185,61,56,158,239,189,7,211,48,61,229,39,213,187,158,126,16,189,95,67,240,61,208,12,2,62,21,57,68,61,240,223,188,186,176,112,242,61,67,86,7,190,237,211,241,59,116,40,195,60,179,210,164,188,3,120,171,189,222,172,65,61,187,237,194,60,205,205,151,61,64,47,92,188,56,192,204,60,230,204,118,61,201,142,141,189,175,93,42,62,204,121,198,188,202,84,129,189,19,125,62,189,21,28,158,189,220,155,95,189,139,81,215,187,34,84,41,60,97,56,215,187,112,123,130,59,110,80,155,61,95,155,13,60,115,156,11,62,31,74,180,187,54,229,10,61,183,241,135,189,139,109,2,190,97,222,227,187,222,229,34,61,166,156,143,189,126,140,121,61,63,255,61,189,193,110,216,188,218,3,173,187,135,252,211,61,118,195,182,188,202,26,117,187,94,190,117,188,183,180,26,189,169,217,163,61,62,177,206,60,112,66,97,189,92,113,145,61,158,178,26,60,0,28,155,189,164,55,92,60,97,198,84,61,135,250,221,60,47,20,144,189,237,42,100,189,93,249,172,188,202,51,175,60,242,119,239,60,62,64,39,62,228,160,4,189,152,248,35,60,31,101,68,188,143,139,234,188,72,167,46,59,223,253,113,60,40,153,28,188,95,152,12,189,235,173,129,60,218,226,186,189,49,179,79,188,255,232,219,189,229,209,13,189,74,123,67,189,100,146,209,189,178,46,46,61,89,21,225,187,149,41,102,60,240,165,48,189,155,144,86,61,12,115,66,189,162,178,97,61,76,165,31,60,99,208,9,189,42,111,167,189,176,227,191,186,25,230,132,188,152,79,22,189,70,91,21,187,154,179,190,60,121,92,20,189,179,211,207,61,118,109,111,189,132,69,133,61,233,242,102,59,237,42,164,59,91,7,199,61,50,89,28,189,31,106,27,189,224,189,35,188,65,159,8,189,40,124,54,189,16,61,41,61,55,52,133,61,32,240,192,56,158,120,206,61,23,160,237,60,221,67,2,189,32,241,59,62,159,144,29,188,190,192,44,188,111,47,233,188,101,25,226,59,58,144,117,188,210,82,185,61,58,3,51,190,47,252,224,60,197,170,129,61,224,218,73,189,204,99,205,186,239,58,187,61,156,250,160,189,34,140,159,187,155,145,129,189,158,235,251,186,21,1,142,61,142,119,167,61,53,150,112,61,67,231,149,61,191,69,167,61,82,210,67,189,59,84,211,188,83,34,137,187,222,255,7,61,187,123,0,190,179,124,221,189,99,8,0,61,125,37,16,61,98,104,245,60,73,46,63,61,162,124,65,61,161,160,180,189,79,117,8,61,167,90,235,61,248,112,73,189,125,151,210,60,122,138,92,61,0,27,16,61,41,146,15,62,120,69,112,189,209,207,212,188,208,9,161,188,213,64,115,188,38,115,172,188,73,215,12,189,131,108,249,189,88,145,49,62,218,227,229,189,178,243,182,188,116,212,145,61,55,141,237,60,59,85,62,61,101,168,138,61,102,75,214,188,151,29,34,190,32,182,116,60,136,185,36,61,169,21,38,188,109,26,91,189,200,181,161,59,43,195,56,188,184,63,151,61,12,231,186,61,30,25,235,61,234,91,102,188,218,32,83,189,218,87,158,61,91,96,207,61,39,250,60,189,234,93,188,60,35,189,136,189,67,56,134,189,120,154,76,61,10,131,50,189,143,23,82,60,142,149,24,60,102,220,20,61,24,207,96,61,250,207,26,61,132,187,179,60,243,114,88,60,8,59,197,59,141,239,203,189,92,2,112,61,105,55,58,189,174,14,128,188,251,118,178,189,105,226,157,188,207,189,7,189,111,99,51,61,40,212,243,61,147,141,167,189,118,112,176,188,170,73,144,189,184,63,87,189,217,33,158,61,222,33,197,56,210,229,77,61,148,248,188,61,204,182,83,61,144,162,206,188,183,126,154,61,155,60,229,60,90,187,141,61,22,51,2,61,177,191,204,189,211,192,143,59,3,7,52,187,204,178,103,189,120,68,37,62,106,247,43,57,72,107,172,61,54,174,255,189,200,37,78,61,187,72,33,60,72,223,100,61,187,38,100,61,25,175,249,60,40,72,236,60,146,8,141,186,100,174,140,188,20,121,210,189,149,100,29,189,157,13,9,190,247,204,18,189,218,140,147,189,14,135,165,60,252,168,134,60,238,119,200,189,63,114,43,61,199,185,13,61,143,55,249,60,76,170,182,189,5,54,103,188,92,31,86,189,159,176,68,60,244,79,240,188,169,165,57,188,210,141,208,61,187,183,130,61,85,103,53,61,23,18,208,61,14,22,14,189,69,189,224,188,103,211,145,188,49,64,162,189,76,109,137,61,104,235,224,188,13,198,200,189,201,203,26,60,201,175,31,189,145,125,32,190,138,32,174,61,157,185,7,61,132,215,174,188,53,183,226,61,105,252,66,188,188,119,212,187,173,251,167,61,60,244,221,188,67,203,186,61,160,169,87,188,250,66,72,188,156,105,194,59,236,137,46,60,157,242,200,189,45,205,173,187,30,136,172,188,38,226,109,189,96,147,149,189,186,104,200,61,115,161,210,189,36,181,16,189,207,245,189,189,213,203,207,189,62,91,71,189,105,87,97,61,102,49,209,61,138,5,126,61,160,22,131,60,125,117,21,61,252,169,113,61,4,143,47,61,58,118,208,60,75,171,161,188,190,219,220,189,138,63,10,189,120,38,52,189,59,86,137,189,216,69,81,61,161,185,206,60,56,163,22,190,145,70,133,188,37,236,251,61,150,5,19,61,13,141,167,188,172,228,35,61,202,226,126,60,110,163,129,60,85,76,165,61,44,154,142,189,46,85,25,190,237,69,180,60,52,247,16,188,64,136,36,61,18,248,195,189,234,4,116,61,214,2,251,188,73,77,123,189,42,167,61,61,84,254,213,61,215,166,49,61,115,246,206,186,201,174,116,61,58,36,213,189,206,110,45,61,84,28,71,189,136,71,98,188,165,107,102,189,170,128,219,61,222,62,107,61,125,179,173,61,164,137,247,60,82,44,183,60,167,61,37,189,140,185,235,188,215,246,246,61,187,10,41,61,145,126,59,189,129,91,247,188,228,216,218,189,238,180,213,189,227,79,148,61,79,32,108,187,241,43,86,188,103,210,38,61,96,232,177,61,157,76,188,61,17,58,136,61,151,58,200,60,208,94,253,188,31,215,6,189,31,47,36,190,119,134,41,188,181,51,140,189,20,4,143,60,82,152,55,61,131,164,79,61,250,126,138,61,194,20,37,61,135,194,231,61,45,181,30,189,70,67,134,189,179,209,217,189,116,66,232,188,179,206,248,61,49,123,217,60,117,31,0,188,118,193,96,61,113,228,193,61,245,215,203,189,207,104,171,59,49,239,241,61,21,58,47,61,36,72,133,189,59,199,0,61,228,16,49,61,247,229,76,189,229,154,130,60,204,97,151,61,247,118,11,61,133,209,44,60,195,160,204,188,109,117,185,60,87,178,227,60,19,183,74,61,170,186,71,61,4,112,51,187,46,171,48,188,253,102,226,188,209,234,228,187,224,71,213,189,249,163,136,189,46,229,124,189,250,69,137,189,76,82,89,189,40,239,99,187,218,174,80,189,229,65,250,189,79,229,180,60,224,16,42,59,211,76,119,60,23,17,197,59,181,135,189,59,68,247,60,190,241,213,14,189,202,225,19,189,177,247,98,61,244,163,225,59,132,241,211,61,171,6,129,189,77,248,197,61,13,139,17,189,80,85,33,60,33,203,194,189,175,180,12,60,0,114,194,60,23,103,12,189,135,80,229,189,249,163,40,189,237,187,34,61,128,216,210,189,120,156,130,61,186,220,32,61,218,255,224,61,163,1,188,61,74,68,248,60,159,91,168,189,10,49,183,61,161,134,111,189,137,92,240,188,201,61,29,61,232,22,122,61,185,110,202,188,9,107,227,61,255,174,15,189,204,64,229,188,2,183,110,60,47,22,6,59,84,53,1,189,154,10,113,61,119,190,159,188,156,51,34,187,6,160,209,188,149,210,19,190,193,0,130,61,186,217,255,61,133,234,102,188,132,187,51,188,6,133,1,61,33,4,36,189,154,209,143,59,23,211,204,60,61,158,86,61,168,86,95,189,234,118,150,189,48,129,219,60,93,81,202,188,113,169,202,60,191,70,242,61,117,232,116,60,149,71,7,190,177,105,165,60,231,227,26,61,122,223,184,189,110,252,73,61,44,128,169,61,183,123,185,188,63,88,198,187,111,242,27,189,119,245,106,189,190,216,219,189,18,217,7,61,31,189,225,188,54,234,161,188,60,74,229,189,52,132,227,60,171,6,129,189,110,20,89,189,47,138,158,60,66,10,30,188,206,165,56,188,199,130,66,60,16,65,213,187,160,81,250,189,3,10,117,61,117,32,43,61,170,183,134,60,23,159,2,189,203,185,20,189,120,98,86,60,9,169,187,61,228,191,128,61,113,60,95,61,230,175,240,189,70,179,50,188,176,58,178,61,130,85,117,188,218,32,19,189,24,236,70,189,202,169,157,188,113,201,49,189,83,8,228,187,165,133,203,59,42,140,45,61,108,65,111,60,177,220,210,187,93,222,156,60,99,210,159,61,14,101,168,188,208,99,148,60,11,151,21,189,218,84,93,189,142,6,240,59,54,206,102,61,38,52,9,189,17,170,212,188,189,141,77,61,7,68,136,189,224,100,187,61,24,35,146,61,93,226,72,189,53,38,4,189,223,27,195,189,196,234,15,188,212,214,72,61,221,66,23,61,185,195,166,60,121,205,27,62,149,44,39,61,129,89,129,189,32,67,199,188,191,243,139,188,142,147,66,60,113,0,125,188,174,74,162,188,176,227,191,185,124,242,48,187,16,119,149,189,99,210,223,61,17,224,244,59,178,131,74,189,12,89,93,189,97,198,84,61,196,150,158,60,133,66,4,62,128,17,180,60,46,83,19,59,227,110,16,61,50,146,189,188,156,111,132,61,152,77,160,189,16,177,1,189,132,97,0,189,48,130,198,187,95,11,58,189,219,20,143,60,66,119,137,189,62,236,5,190,46,85,137,61,76,224,86,61,162,156,40,189,38,138,144,187,128,69,62,61,19,43,99,189,132,69,69,61,57,182,30,188,175,95,176,60,65,74,236,59,130,142,214,61,223,135,163,61,203,162,176,61,115,19,149,189,135,192,145,58,194,20,229,188,155,226,145,189,210,139,90,188,90,186,2,60,24,35,242,189,243,86,157,61,147,225,120,189,227,195,172,189,51,140,59,188,97,253,31,60,237,11,104,60,35,189,40,62,241,47,130,188,125,8,170,188,82,43,28,62,250,154,101,188,13,110,43,189,228,161,239,189,11,152,64,188,183,240,188,187,136,246,177,189,105,0,15,190,12,121,4,189,12,34,210,60,237,127,0,188,3,11,32,189,206,193,211,61,231,115,46,189,97,168,195,187,17,138,173,186,111,245,92,189,242,177,59,186,27,156,72,61,55,79,5,62,54,58,231,60,213,150,122,61,40,157,200,60,107,185,179,188,164,255,229,187,109,143,94,61,208,126,36,188,216,102,195,189,122,196,168,61,191,154,3,189,13,165,118,188,224,104,7,61,194,161,55,59,103,42,164,189,66,237,183,188,134,145,158,61,146,231,122,188,84,142,9,61,203,76,233,60,246,208,190,60,243,173,15,61,106,23,211,59,82,99,226,189,116,150,217,189,98,72,14,189,90,71,213,189,70,153,13,189,130,30,234,189,8,147,162,61,37,231,196,59,235,167,127,59,130,1,164,61,170,157,97,61,191,73,83,60,194,20,133,61,120,94,106,61,52,101,231,189,206,251,127,59,122,196,232,188,17,226,74,188,98,102,95,189,104,175,158,61,49,210,139,59,178,16,253,61,167,119,241,59,77,129,204,61,5,167,190,60,26,247,230,188,221,234,249,61,149,14,22,189,140,160,1,190,32,150,13,189,60,188,231,188,177,51,133,189,169,246,105,60,222,89,59,60,91,123,159,187,137,209,51,61,89,250,16,61,115,72,234,60,112,91,155,61,40,155,242,61,197,140,144,61,61,152,84,189,184,1,47,190,230,61,78,61,127,49,91,61,23,103,140,188,221,40,178,60,119,219,197,189,21,226,17,60,153,126,137,186,20,91,161,61,120,66,207,189,51,222,214,188,111,217,161,188,157,132,18,189,0,196,93,61,20,89,139,61,232,134,166,188,202,193,204,61,72,226,197,61,252,85,64,189], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE+20480);
/* memory initializer */ allocate([213,37,227,186,177,26,75,61,51,222,86,61,6,241,1,189,131,24,232,188,122,137,177,187,252,82,63,61,128,70,105,60,236,81,8,62,93,221,177,187,224,243,163,189,252,23,8,189,237,74,11,61,58,7,207,60,228,243,10,61,128,239,54,189,26,23,14,189,116,37,162,189,168,139,36,190,32,150,29,190,242,66,106,190,46,144,32,187,94,246,171,189,67,85,44,190,227,53,47,60,25,88,71,188,189,55,134,54,168,196,53,189,188,120,191,60,74,151,158,189,60,134,71,60,159,62,130,188,236,103,49,188,238,181,128,189,120,41,245,60,87,177,152,189,100,87,90,189,165,133,75,61,168,138,105,61,209,230,184,188,10,72,123,60,248,165,62,189,176,201,154,60,8,142,203,188,52,247,144,187,161,105,41,62,83,149,118,189,0,254,201,189,86,130,133,189,2,215,21,61,98,247,29,189,98,192,82,61,101,113,191,61,136,71,34,61,49,182,240,61,76,28,185,61,247,144,240,188,109,86,221,61,157,185,135,188,198,164,191,189,118,225,71,189,4,198,58,189,162,124,193,188,233,129,143,61,136,213,223,189,67,230,202,58,79,59,156,61,221,237,186,189,56,246,140,189,159,113,97,57,181,138,62,189,22,107,184,188,157,187,221,188,26,52,116,60,170,211,161,61,102,19,16,62,252,110,122,61,82,95,22,60,34,81,200,61,190,21,9,61,118,110,218,187,153,183,234,59,223,80,248,187,126,112,254,189,33,5,207,188,8,6,144,60,222,176,45,61,211,75,12,189,12,229,132,61,10,215,35,59,198,107,14,190,41,119,31,60,173,249,33,62,91,36,109,60,61,99,31,61,88,144,102,61,67,198,163,187,215,107,154,61,172,82,250,188,202,21,30,189,160,253,72,189,98,132,112,188,82,70,156,189,177,138,7,190,39,245,53,190,171,236,187,61,101,114,106,189,113,59,148,189,103,100,80,61,33,230,82,61,102,102,230,60,139,139,163,59,153,157,5,61,40,96,43,190,183,241,39,61,60,188,231,187,27,245,176,189,248,27,45,189,111,217,161,188,41,207,60,188,27,45,135,61,193,115,175,61,58,60,4,60,65,13,95,188,156,136,126,189,180,142,170,61,144,133,104,58,132,71,155,189,192,231,7,60,65,244,164,188,130,84,138,188,23,158,183,61,216,158,217,189,58,232,82,189,35,221,79,188,229,94,96,61,76,253,60,60,40,98,177,61,137,96,92,61,9,135,222,60,165,44,195,188,122,224,35,189,131,220,165,61,249,133,215,60,185,28,175,185,122,171,174,189,219,79,198,188,116,41,174,189,5,196,196,61,220,214,246,61,35,247,52,189,19,214,70,59,168,168,186,189,175,10,212,59,52,130,237,61,187,236,215,188,181,167,100,59,199,71,171,61,147,58,225,61,179,12,241,188,103,212,124,61,216,216,101,61,243,231,219,187,167,148,87,60,161,218,128,189,50,60,118,188,200,206,91,59,189,83,1,61,221,205,243,61,204,66,187,60,252,199,194,60,173,220,139,189,202,193,236,61,212,128,1,61,155,175,18,60,27,130,227,59,221,65,108,60,254,100,12,60,109,55,1,189,175,176,224,187,229,184,83,189,219,134,177,189,214,224,221,189,46,227,166,59,203,129,222,189,143,54,14,189,94,77,94,61,112,38,198,189,244,25,80,61,93,249,172,188,207,19,207,188,120,213,163,189,226,63,221,60,213,32,12,189,120,67,186,61,132,14,186,59,222,1,158,60,57,95,44,61,126,112,126,61,33,29,158,60,196,91,39,61,177,78,21,188,212,184,183,60,209,177,131,187,203,103,121,189,96,177,6,61,32,184,74,188,185,140,27,189,78,98,144,60,55,140,162,189,20,7,80,189,61,68,163,61,82,42,33,189,89,190,174,189,71,117,186,61,100,87,218,60,27,70,129,189,6,131,203,61,39,163,202,188,5,83,173,61,134,169,205,189,32,37,150,189,218,145,106,60,67,197,184,60,38,172,237,189,155,0,131,189,107,186,30,188,82,99,130,189,185,222,6,190,183,42,137,60,200,68,10,190,235,1,115,187,11,239,50,189,172,25,249,189,233,67,23,189,108,203,0,62,200,182,172,61,49,181,37,60,143,225,145,61,202,79,42,188,250,67,115,61,107,125,145,60,169,78,7,61,128,157,155,188,71,172,5,190,113,2,211,60,24,152,149,188,179,240,117,189,215,18,2,62,154,9,6,189,148,191,219,189,128,44,132,189,49,120,184,61,46,227,38,188,152,109,135,189,236,47,219,61,176,61,51,188,40,12,74,59,205,228,155,60,85,19,196,188,76,138,15,190,87,150,104,59,184,173,45,189,21,58,47,188,128,96,62,190,31,46,121,61,109,28,177,59,171,117,98,188,83,63,239,60,246,123,162,61,217,148,139,61,186,102,146,61,245,17,248,60,149,153,178,189,175,124,150,61,109,226,228,188,160,110,160,59,245,44,8,189,181,194,148,61,99,152,147,60,177,25,96,61,212,127,214,60,146,62,173,187,188,33,13,61,80,138,22,189,99,68,162,61,104,231,148,61,17,167,147,59,156,48,33,189,95,239,126,188,196,92,146,189,250,12,40,60,33,33,138,61,9,52,216,187,79,34,66,61,8,231,147,61,216,187,191,60,56,75,169,61,139,252,122,60,87,37,17,189,76,139,154,189,150,6,254,189,171,66,3,189,56,48,121,61,237,159,39,60,178,47,89,189,17,199,186,60,121,174,47,61,73,47,42,189,142,146,7,62,96,60,195,189,227,225,157,189,82,214,111,189,131,167,144,189,195,216,66,61,112,123,2,61,78,43,5,57,6,131,235,61,120,69,112,61,246,97,189,189,38,26,132,61,148,135,197,61,222,147,135,61,37,206,138,186,31,189,33,61,41,151,6,189,187,152,134,189,165,216,209,58,190,76,180,61,52,14,117,61,9,50,66,189,133,40,159,189,121,88,40,60,43,76,95,60,236,135,88,59,52,45,177,59,101,83,46,58,197,203,83,60,109,197,158,189,199,185,141,61,236,49,33,190,138,86,110,60,76,137,196,189,81,75,179,189,231,251,137,189,86,73,228,188,6,217,178,59,61,71,196,189,97,164,215,61,172,224,55,189,65,240,56,61,238,208,176,186,46,27,29,61,34,52,2,190,194,222,164,189,4,232,215,189,194,107,151,188,187,67,10,60,158,206,213,61,70,10,229,188,180,28,168,61,209,203,168,188,83,63,47,61,69,132,223,189,223,165,212,188,14,75,163,61,198,163,20,61,46,145,171,189,203,133,10,189,237,99,5,61,57,66,134,189,190,51,218,59,98,248,8,59,23,182,198,61,252,251,236,61,156,110,89,188,200,68,138,189,29,114,3,62,68,137,182,189,127,77,214,60,105,59,38,189,189,26,32,187,67,88,141,188,14,78,4,62,147,112,225,189,214,0,133,189,91,182,182,61,100,172,182,188,43,49,15,189,172,224,183,60,145,186,157,188,155,85,31,189,207,19,143,189,71,119,144,189,108,65,143,61,150,92,229,61,129,204,206,187,208,99,20,188,211,20,193,61,89,165,116,188,71,170,111,59,69,75,158,188,10,46,214,60,50,58,128,189,208,11,151,189,252,86,235,187,225,7,103,60,172,60,129,60,10,49,87,61,29,144,132,61,16,8,36,190,115,214,167,187,137,96,156,61,252,141,214,189,175,96,187,61,230,174,165,60,71,4,227,185,207,103,128,61,194,161,119,189,186,20,23,190,23,131,135,189,9,196,235,59,84,229,123,189,57,213,26,189,135,222,34,189,192,235,115,61,23,188,232,188,179,152,152,189,59,52,108,61,199,159,168,60,247,30,46,189,4,89,207,188,99,238,26,189,178,133,64,190,243,143,158,61,84,229,251,60,250,155,208,188,240,82,138,189,99,100,73,59,4,228,75,189,31,219,2,62,83,149,54,59,71,199,245,61,5,225,138,189,216,158,217,188,147,226,227,61,198,53,190,60,205,232,199,188,197,174,109,188,246,41,71,189,46,143,181,60,16,36,111,60,143,140,85,189,1,24,207,58,98,74,132,61,36,39,147,60,65,188,174,60,41,120,202,61,229,153,23,188,161,48,40,189,227,221,17,60,8,147,98,188,212,239,2,61,66,209,156,61,71,62,175,187,212,67,52,189,25,2,0,61,87,118,193,57,121,206,22,61,122,52,149,61,135,250,29,189,255,88,136,59,227,22,3,190,233,181,89,189,83,120,80,61,193,59,121,188,118,27,20,189,154,177,200,61,186,19,140,61,147,138,70,189,159,233,101,189,27,76,67,188,30,111,114,61,209,92,39,60,133,122,122,189,169,248,63,188,66,63,19,189,186,161,105,189,73,20,186,61,170,39,243,188,65,216,41,61,25,171,205,188,239,86,6,62,222,0,115,61,72,221,174,61,26,194,177,60,101,165,73,61,87,9,22,61,68,223,157,189,227,221,145,60,136,215,181,189,250,97,132,59,81,103,142,189,55,108,219,188,36,94,30,60,143,167,101,60,65,244,100,189,105,56,197,189,228,45,247,61,19,184,245,60,173,137,5,61,205,233,178,186,80,83,11,61,102,47,91,189,31,45,206,58,103,10,157,188,85,161,129,59,76,107,211,59,102,219,137,61,128,215,231,60,66,120,36,62,236,138,89,189,80,54,101,60,239,172,221,188,235,113,95,188,187,72,33,61,140,19,95,189,148,189,197,189,229,211,163,61,49,94,51,189,193,55,205,188,49,40,83,187,127,18,159,60,186,218,74,189,101,195,26,62,143,196,11,61,93,194,97,61,0,84,113,61,196,123,142,188,95,96,214,60,194,105,1,190,170,182,155,188,123,17,237,188,129,209,101,188,177,136,49,190,73,132,6,189,56,219,92,187,127,135,34,61,10,77,242,189,29,170,233,61,212,126,43,189,126,110,40,61,226,63,29,189,114,194,196,189,179,8,5,189,88,171,118,61,168,1,131,61,242,238,200,188,22,192,148,60,14,18,34,188,157,189,51,189,152,248,163,187,75,234,4,62,90,99,208,188,94,48,248,189,0,58,76,61,23,46,43,60,227,109,37,189,146,89,125,61,30,193,141,188,111,184,15,189,44,46,14,188,66,206,123,61,105,195,33,189,106,164,165,187,91,35,162,61,1,247,60,61,90,18,32,60,186,221,139,61,103,184,161,189,61,95,51,189,244,23,250,188,147,140,92,189,247,148,92,61,241,14,16,190,170,69,228,61,87,150,104,59,181,194,116,188,169,135,24,62,38,56,149,61,115,243,141,59,144,21,124,60,1,250,125,61,136,133,250,189,33,61,5,189,222,201,39,60,198,136,68,189,125,121,1,190,124,184,100,61,104,122,137,61,46,60,207,61,20,92,44,187,237,241,2,61,48,186,60,61,192,60,164,189,237,129,214,61,158,40,9,189,11,95,159,189,68,108,112,189,160,22,195,189,196,122,227,189,199,132,24,61,127,223,63,60,21,226,145,58,19,153,185,187,54,4,71,61,251,120,40,61,247,58,201,61,33,175,7,61,53,42,240,60,106,50,195,189,110,139,146,189,254,213,35,189,210,139,218,60,40,212,147,189,170,124,15,61,217,5,3,188,26,82,69,189,251,176,222,187,100,144,155,61,222,60,85,189,232,130,250,187,1,221,23,61,11,182,17,189,120,66,175,61,180,199,11,61,163,145,79,189,68,168,82,61,98,17,3,61,9,136,9,190,141,42,195,186,228,47,173,61,4,175,150,188,229,126,199,189,107,216,47,189,222,199,209,188,79,206,208,188,66,179,43,61,205,230,17,62,52,74,151,59,191,72,40,189,136,15,236,188,245,100,126,188,51,254,253,188,154,177,232,60,169,48,182,188,178,185,138,189,55,198,206,188,7,92,87,189,55,226,73,60,16,230,246,189,113,89,133,60,102,105,167,189,102,20,203,189,202,250,205,60,165,105,208,60,112,36,80,59,174,73,151,189,188,234,1,61,175,120,234,188,107,210,237,60,254,183,146,60,227,111,251,188,173,110,213,189,142,172,124,188,165,161,134,189,117,6,70,189,57,124,82,188,189,228,63,61,24,63,13,188,220,185,112,61,38,54,95,189,219,107,1,61,227,26,31,189,121,177,48,61,199,158,189,61,245,42,146,189,128,11,114,189,168,228,156,186,32,121,231,58,210,28,153,189,18,107,241,60,152,136,183,61,138,34,164,59,105,254,88,61,159,62,130,60,132,14,58,189,233,68,34,62,184,149,30,189,3,37,5,189,0,1,235,60,222,89,59,60,167,231,221,187,118,253,66,61,125,33,20,190,246,211,255,188,138,175,150,61,83,232,60,60,218,227,5,188,77,47,113,61,90,17,181,189,226,175,9,61,106,193,11,189,170,128,251,188,207,73,207,61,208,237,197,61,219,50,224,60,182,244,40,61,133,234,166,61,140,103,208,188,80,198,248,59,93,82,117,61,63,88,70,60,249,100,229,189,164,227,234,189,0,83,134,60,181,80,178,61,196,179,132,60,39,249,81,61,34,55,67,60,82,211,174,189,108,94,213,60,131,190,20,62,97,165,66,189,110,248,157,61,30,225,180,185,109,113,13,61,119,100,204,61,233,98,179,189,233,155,116,189,1,81,112,189,242,66,186,60,55,85,247,186,130,60,219,189,75,30,239,189,113,85,9,62,66,238,98,189,13,252,168,59,78,123,138,61,32,10,166,61,16,5,147,61,159,170,130,61,218,201,96,187,244,23,218,189,86,182,143,60,194,24,17,59,123,218,97,188,42,3,7,189,93,55,37,60,57,69,199,60,179,67,60,61,224,71,117,61,150,8,148,61,146,8,13,188,61,215,119,188,148,135,69,61,37,4,43,61,155,254,140,189,193,83,72,60,22,218,185,189,44,160,16,189,17,196,57,61,159,5,161,189,101,167,159,188,244,136,17,61,37,232,111,61,8,4,58,61,5,224,31,61,241,245,53,188,225,212,71,61,113,141,207,188,98,220,173,189,97,165,2,61,51,196,49,60,218,57,77,60,124,237,89,189,236,222,138,60,86,100,52,189,48,213,140,61,231,83,199,61,51,83,250,189,169,80,221,60,63,1,84,189,200,122,106,189,15,182,152,61,194,49,203,59,212,41,143,61,116,240,204,61,230,230,155,61,119,46,140,59,174,98,241,60,11,66,57,61,219,19,100,61,124,237,153,60,223,221,138,189,149,69,33,61,204,8,239,60,247,173,22,189,3,10,5,62,186,130,237,188,217,118,26,61,2,16,215,189,178,19,14,62,56,50,143,187,215,81,85,61,92,56,80,61,114,252,208,60,29,30,66,187,173,165,0,60,12,61,98,189,112,182,153,189,40,44,241,57,190,190,182,189,238,149,249,188,248,140,164,189,230,93,245,59,120,40,138,61,211,102,156,189,195,15,174,61,228,248,33,61,0,197,8,61,203,134,53,189,53,99,209,59,167,149,162,189,236,164,62,187,49,94,243,188,235,31,68,189,30,27,129,61,175,151,134,61,251,172,178,60,157,75,145,61,39,22,248,187,223,167,170,186,211,80,131,189,53,70,139,189,82,15,81,61,40,98,145,188,237,241,130,189,31,248,152,60,226,63,29,189,249,186,204,189,232,106,107,61,60,76,251,187,89,191,25,60,196,207,223,61,214,171,72,60,84,31,72,189,151,111,189,61,60,17,68,60,163,1,124,61,211,21,236,188,4,232,119,188,49,235,197,188,178,17,8,189,212,44,208,189,203,74,147,188,117,5,91,187,126,25,76,189,42,25,0,190,156,81,3,62,99,14,66,189,223,25,237,188,36,97,223,189,189,112,135,189,198,50,125,188,86,99,201,61,141,155,90,61,76,136,57,60,33,59,47,61,140,129,53,61,62,5,128,61,34,138,201,61,174,245,133,61,180,173,38,189,111,73,238,189,81,105,4,189,36,97,95,188,30,253,111,189,36,237,166,61,29,28,44,61,55,84,204,189,116,181,149,188,89,79,173,61,57,39,246,187,27,102,40,189,247,3,94,61,251,118,146,60,251,175,243,188,1,53,117,61,76,194,69,189,238,96,228,189,200,35,184,188,74,240,6,59,142,92,183,60,95,94,0,190,231,115,110,61,112,94,28,59,231,29,167,189,55,226,73,61,206,52,33,62,0,112,108,61,234,88,165,59,233,38,209,61,228,243,170,189,54,119,52,61,15,72,194,189,75,60,32,61,147,166,129,189,101,222,106,61,197,226,119,61,158,235,219,61,202,221,231,59,54,145,25,188,125,179,77,188,79,117,136,189,35,221,239,61,122,225,206,60,25,29,16,188,171,94,126,189,227,81,170,189,108,206,161,189,18,192,173,61,39,75,45,61,212,185,98,189,125,9,21,61,11,211,7,62,118,251,172,61,63,142,102,61,236,164,62,188,229,238,115,189,57,181,179,189,255,233,22,190,16,176,86,189,124,42,39,188,161,15,22,188,70,63,154,188,102,161,29,60,226,114,124,61,215,190,128,60,213,206,176,61,185,194,123,189,51,223,65,188,24,5,129,189,131,104,173,188,219,50,0,62,34,108,56,61,77,73,86,61,192,178,210,60,160,224,194,61,232,250,190,189,53,70,235,60,191,214,101,61,113,174,129,61,57,156,57,189,34,110,206,60,234,65,193,60,88,88,144,189,61,44,148,61,159,90,189,61,86,127,68,61,115,101,208,188,58,231,167,186,234,66,172,60,144,159,13,61,157,160,173,61,146,4,225,59,205,33,41,188,135,196,61,189,40,70,22,188,174,187,249,60,176,1,241,189,42,112,178,188,98,72,14,189,220,185,176,189,233,241,59,189,1,48,30,60,109,60,24,189,247,148,252,189,219,165,141,60,63,253,231,188,206,82,146,61,147,53,106,189,188,206,6,189,152,195,14,190,166,182,212,188,72,254,32,189,152,48,26,60,238,64,93,189,216,70,156,61,205,202,118,189,75,117,225,61,234,90,123,189,118,82,31,61,83,236,200,189,71,231,60,61,202,54,48,61,10,162,238,188,165,107,198,189,92,202,249,59,225,94,185,61,10,130,199,189,90,43,90,61,201,199,110,61,45,181,94,61,234,232,120,61,108,92,127,60,132,44,139,189,94,190,117,61,154,8,27,189,53,38,196,59,178,242,75,58,84,229,59,61,251,60,134,189,9,138,159,61,250,98,175,189,253,249,54,58,135,222,226,60,155,1,174,188,84,254,53,187,79,89,13,61,13,81,69,189,181,164,35,60,222,30,132,58,184,149,158,189,37,2,213,60,119,214,14,62,64,251,17,60,165,75,255,59,43,220,114,61,29,170,105,189,239,116,103,60,131,20,188,188,185,136,175,61,50,113,139,189,116,9,167,189,99,122,194,59,124,72,248,59,144,21,124,61,13,194,156,61,91,148,217,58,210,254,231,189,45,148,204,60,252,169,177,61,224,157,124,189,75,174,194,61,46,254,182,61,2,46,200,188,60,23,198,60,204,7,132,188,108,205,150,189,62,60,139,189,214,252,152,61,169,248,63,189,231,199,95,189,199,104,189,189,232,76,218,59,114,55,8,189,32,66,92,189,70,181,72,61,233,73,25,187,217,235,93,60,135,195,210,187,241,16,70,188,56,218,177,189,1,53,213,61,70,234,125,61,231,137,231,59,18,51,155,61,39,135,143,189,214,113,188,189,24,37,136,189,79,93,185,61,163,92,218,61,78,67,212,60,68,76,137,188,90,14,116,59,169,192,201,188,137,237,110,61,220,245,82,60,10,242,115,61,240,25,9,187,244,78,133,189,212,154,198,189,70,93,43,189,48,98,31,187,0,84,113,61,209,61,107,60,187,240,163,61,117,58,16,188,41,9,9,187,31,218,199,189,211,189,174,61,26,109,213,188,122,83,177,189,219,81,28,188,54,176,5,62,234,235,57,61,94,213,25,61,242,9,153,61,206,167,78,189,31,73,9,61,36,184,17,189,209,118,172,189,54,2,177,189,64,251,17,60,27,214,148,189,180,34,202,189,28,8,201,188,221,150,72,189,48,42,137,189,18,217,71,189,95,211,3,61,65,100,145,61,22,49,108,188,35,76,17,62,112,62,53,189,249,17,223,189,194,134,167,188,30,139,237,61,28,237,56,60,121,58,215,188,199,102,199,60,237,215,13,62,108,94,21,189,126,113,169,60,148,20,152,61,224,100,91,189,236,164,158,61,197,203,147,61,223,135,3,61,156,105,162,189,151,30,205,188,165,44,163,61,178,241,192,61,111,16,237,189,56,77,31,61,95,121,80,61,186,215,201,188,245,218,108,61,153,40,226,189,235,200,145,61,154,210,122,60,229,95,11,189,242,64,100,189,119,220,48,61,206,52,129,189,53,153,49,61,248,168,63,188,49,123,217,59,31,74,52,59,63,169,246,60,36,72,165,186,98,74,228,61,57,67,49,61,25,202,137,187,99,240,176,188,74,182,186,187,79,4,113,61,209,118,44,62,48,242,114,61,204,152,2,188,27,103,179,189,42,84,151,61,175,120,170,189,202,82,203,61,243,62,142,188,106,248,150,188,7,8,102,60,34,136,115,188,103,96,228,189,144,49,183,61,163,116,233,188,110,48,180,189,243,89,158,189,122,53,128,189,106,247,171,57,223,109,222,188,30,24,192,189,185,27,228,61,82,101,152,188,17,57,189,61,189,195,237,187,201,0,208,60,143,169,59,60,123,191,81,60,166,184,42,189,150,89,4,60,246,64,171,60,123,220,215,189,215,134,170,189,141,96,227,60,212,72,75,189,121,146,52,189,249,161,82,189,125,63,213,61,206,53,76,186,144,47,129,189,245,213,5,190,78,98,144,61,190,21,9,61,206,55,162,188,172,230,121,189,243,58,194,61,247,86,36,189,107,128,242,61,103,68,105,61,196,237,176,61,164,194,216,187,74,179,57,61,147,0,53,189,10,15,218,189,123,193,167,189,83,91,138,61,98,162,1,189,43,137,108,188,64,222,107,61,175,90,249,189,183,42,73,189,32,235,105,61,149,70,76,189,101,166,52,61,14,132,132,61,3,147,187,189,52,185,24,61,22,23,71,189,65,243,57,189,15,126,98,59,1,106,106,61,119,49,205,59,176,31,98,189,205,206,130,189,206,255,171,187,216,125,167,61,80,53,10,62,177,195,24,187,48,160,87,61,48,44,191,189,127,165,147,61,132,158,237,61,220,212,0,189,80,0,197,187,197,255,29,189,68,166,252,188,0,143,40,60,116,12,200,60,74,150,83,61,244,82,177,189,1,250,61,61,95,70,177,59,43,138,87,61,60,249,148,189,208,214,161,61,94,242,159,61,239,84,192,189,104,120,179,59,214,59,220,187,111,70,205,61,157,18,144,188,33,148,55,61,142,35,22,61,138,200,176,60,206,197,223,187,126,28,77,189,49,235,69,187,82,186,180,61,195,42,94,60,81,136,128,188,85,108,76,60,219,109,87,189,121,34,72,189,110,252,9,189,142,204,99,61,188,6,189,61,184,144,135,189,217,122,134,60,241,73,135,189,232,105,64,61,134,29,70,59,164,80,214,61,178,130,223,61,52,219,149,60,176,57,135,188,118,193,224,187,30,193,141,59,35,22,145,61,197,32,16,62,255,35,211,60,11,65,14,61,21,0,163,189,108,5,77,61,228,20,221,189,56,216,27,59,8,173,199,61,227,23,222,60,200,206,251,189,50,203,30,187,104,65,168,188,8,144,129,189,213,145,195,189,62,35,33,190,90,126,32,189,217,180,210,60,25,87,220,60,82,73,157,186,112,64,11,61,180,62,229,186,241,72,124,61,64,220,85,188,186,188,217,189,51,167,139,189,152,219,61,61,44,159,101,189,161,218,32,62,244,50,74,189,29,4,93,61,137,41,81,189,183,67,67,189,44,14,167,61,189,197,131,61,13,137,251,188,188,2,145,189,155,173,156,189,221,151,115,189,16,121,75,60,137,124,151,61,88,117,214,188,221,149,29,189,158,183,113,61,50,145,18,189,25,58,246,188,139,223,20,189,145,211,87,189,202,109,123,188,22,218,185,188,182,128,16,189,247,34,90,60,186,19,140,61,20,233,62,189,245,43,29,188,181,25,39,189,109,55,33,62,88,86,154,189,243,58,226,189,156,105,2,61,207,218,237,188,178,101,121,188,63,253,39,61,169,47,203,189,115,17,223,189,67,88,13,188,27,42,70,60,27,216,170,60,105,198,34,60,138,1,178,189,149,244,112,61,241,43,214,187,115,19,181,60,24,68,164,187,38,29,101,59,180,33,63,61,87,37,81,189,190,190,22,189,127,221,137,189,103,213,231,187,252,53,57,62,69,189,224,188,62,66,205,188,7,36,33,189,82,98,151,189,140,103,80,187,69,47,227,189,187,241,46,189,186,216,180,59,103,97,15,189,5,21,181,189,107,11,47,62,80,0,197,58,33,205,248,189,207,243,135,61,179,236,137,189,234,232,184,59,45,5,164,61,126,85,46,189,61,127,218,187,223,168,21,189,101,111,169,60,98,129,47,61,225,41,228,60,245,73,238,188,38,57,32,190,30,23,213,59,24,124,26,61,106,104,3,61,24,90,29,61,80,223,178,60,107,15,219,189,152,50,48,189,221,208,148,60,152,50,144,61,150,204,177,187,148,193,17,189,49,121,227,189,92,200,35,189,176,143,78,61,201,0,16,61,234,3,137,61,68,164,38,189,41,235,119,61,170,96,20,61,6,156,37,59,119,47,119,188,202,168,114,61,59,58,174,60,142,3,47,188,230,2,151,188,52,48,114,61,152,248,227,61,129,120,93,189,79,144,216,61,128,216,82,189,31,128,84,188,242,177,187,185,15,67,203,189,7,124,158,189,80,52,143,61,95,40,32,189,157,189,147,189,147,252,72,189,200,66,180,189,156,83,201,59,131,165,58,58,14,243,165,61,21,30,180,60,0,139,60,189,162,236,109,61,218,3,173,186,214,230,63,189,100,61,53,188,103,215,221,61,97,53,150,186,163,205,145,189,156,53,56,61,150,9,63,187,176,198,89,187,82,242,42,61,210,171,193,61,70,66,91,61,49,40,19,61,166,96,205,61,248,255,113,61,248,108,93,189,89,50,71,188,107,17,17,189,17,55,167,60,54,230,149,189,93,224,114,61,203,215,37,189,111,18,195,189,190,105,122,187,38,226,173,189,118,224,92,61,86,155,223,61,5,22,192,187,223,168,21,189,104,207,165,61,120,125,38,189,215,105,164,60,160,168,108,61,46,116,165,188,245,18,163,189,54,204,80,187,85,77,80,189,238,66,3,62,24,66,14,61,45,91,107,61,160,83,16,189,127,221,105,189,99,68,162,186,147,228,249,61,103,211,145,189,93,140,65,189,162,9,84,189,69,215,69,61,227,196,87,189,251,232,212,60,80,52,143,188,59,172,240,188,66,206,251,60,33,92,65,61,11,13,68,189,66,119,9,189,74,207,244,60,245,185,186,189,80,254,174,189,142,35,214,188,192,179,189,61,113,169,138,61,247,87,175,189,88,198,166,61,227,194,65,61,195,216,2,61,3,151,71,189,215,108,37,189,129,66,61,61,89,79,45,60,90,43,26,189,19,153,57,60,113,232,45,189,245,47,25,190,218,199,10,61,89,106,125,189,224,45,16,60,117,143,108,61,163,90,196,189,15,151,28,61,237,102,198,61,170,41,9,189,174,17,17,190,173,49,104,188,232,248,232,60,13,251,189,189,54,3,92,189,66,6,178,61,196,123,14,61,122,81,11,62,40,124,182,187,105,139,235,60,38,199,29,60,226,176,52,61,136,75,78,189,115,160,135,189,65,42,197,59,224,19,107,60,104,119,200,60,60,48,0,58,251,177,137,61,16,150,177,188,113,56,243,189,176,226,20,61,95,12,37,189,149,97,156,61,180,88,10,188,194,75,176,189,56,76,52,189,233,98,211,188,151,84,237,60,2,70,23,188,202,49,89,61,185,193,16,189,205,144,58,190,98,243,209,189,188,179,182,61,187,212,136,61,176,199,4,61,87,7,64,61,44,154,14,189,47,49,86,189,109,228,186,60,161,187,4,62,64,79,3,62,13,84,70,188,25,89,178,189,141,10,156,59,214,58,177,61,253,187,62,61,114,112,201,61,1,76,153,188,96,148,32,61,225,210,177,188,231,53,118,189,255,177,240,189,105,225,178,187,216,212,121,61,182,105,108,189,67,114,178,188,164,253,15,61,212,240,205,61,226,117,125,188,69,128,211,188,222,113,10,60,93,22,83,61,141,237,181,186,166,184,234,189,178,43,109,189,125,119,43,61,238,10,125,61,249,48,59,61,163,229,160,189,49,179,143,189,130,115,70,189,55,79,181,189,160,26,175,60,210,170,150,187,42,198,185,189,67,254,25,188,37,116,151,189,23,183,17,189,103,242,77,189,199,17,235,61,191,44,13,62,103,153,133,61,80,137,107,59,125,207,136,189,255,119,20,190,152,48,42,62,220,13,34,61,190,247,183,188,78,127,246,188,153,154,132,60,97,109,236,61,122,85,199,189,100,201,156,188,51,167,203,61,82,12,16,59,37,145,253,188,207,215,172,60,77,244,57,189,206,251,63,189,32,151,184,60,228,106,132,189,154,68,189,59,73,246,72,61,178,74,233,188,237,215,157,60,250,68,94,61,86,184,229,60,19,156,58,61,71,145,181,187,236,23,108,188,174,245,197,188,132,46,97,189,74,8,150,189,172,115,172,61,122,197,19,61,172,169,140,189,145,69,154,59,5,140,174,189,43,190,161,58,45,124,61,61,229,212,78,189,79,60,231,188,225,210,177,189,76,165,159,186,58,30,179,60,109,114,120,59,214,229,20,186,166,185,181,189,8,2,36,189,113,2,19,189,141,238,96,189,197,115,150,61,34,51,7,190,164,111,82,188,204,96,140,189,14,216,85,60,177,220,178,61,46,30,30,61,102,77,236,189,44,239,42,188,43,20,233,187,108,209,194,61,111,15,66,189,103,156,166,189,199,160,147,60,89,79,173,188,92,88,247,189,227,254,35,61,63,30,250,59,7,183,181,189,13,169,34,188,214,0,165,60,30,23,85,61,80,140,172,188,108,233,241,189,211,104,210,61,87,181,100,189,92,33,172,59,5,164,125,189,169,106,130,61,189,195,109,188,52,246,165,188,78,155,241,60,121,30,92,188,6,17,169,188,240,248,182,61,113,33,143,58,89,109,62,189,20,33,21,190,68,79,170,189,250,239,33,190,235,253,142,190,135,166,108,59,154,208,100,61,215,105,132,189,158,206,181,189,1,218,182,61,140,163,242,188,46,55,184,189,185,224,140,60,226,118,136,189,207,105,86,189,8,4,186,61,240,77,179,189,152,53,177,57,67,145,174,61,173,24,174,187,70,10,197,61,52,48,146,61,38,196,156,189,49,152,159,189,2,97,39,189,151,228,128,61,197,57,42,61,67,255,132,60,108,119,143,188,116,10,114,60,28,208,210,188,48,45,234,60,65,245,143,61,64,136,100,61,174,16,214,188,15,154,157,189,39,103,168,189,197,1,52,61,230,33,19,189,0,85,28,62,255,202,74,189,241,183,189,60,192,92,11,60,229,99,55,189,227,52,36,190,63,171,204,60,212,155,209,188,45,177,146,189,39,48,29,189,244,51,181,61,91,236,246,61,158,96,63,61,6,160,177,61,169,48,54,58,62,8,129,188,108,10,228,188,171,204,36,190,157,159,194,189,230,144,20,61,151,116,20,188,183,9,119,188,99,155,20,189,81,78,212,189,241,159,110,189,15,13,75,189,98,101,180,60,75,202,221,61,225,121,41,187,33,118,134,61,121,61,152,188,235,56,62,189,118,25,254,188,204,238,137,61,253,191,106,60,137,41,17,60,88,115,128,185,220,215,129,61,134,61,237,186,201,60,50,61,70,6,185,61,43,193,130,189,41,208,167,60,254,156,162,61,182,128,144,61,206,113,238,189,240,164,5,61,34,53,141,61,131,247,85,61,23,101,54,189,229,69,198,61,234,7,245,60,152,104,16,188,113,170,53,61,72,53,44,190,24,90,29,60,231,171,100,61,64,80,206,189,55,25,213,188,241,156,173,60,5,163,82,189,113,2,19,61,119,219,133,187,139,135,247,60,120,10,121,189,32,97,24,61,18,246,237,59,57,42,247,61,37,236,219,60,242,119,111,61,9,108,206,189,239,86,22,188,84,2,226,60,43,221,253,61,85,220,56,188,21,229,210,188,181,52,215,189,233,41,242,61,30,136,44,189,13,28,208,188,10,218,100,58,62,32,80,188,142,91,172,61,227,81,138,189,171,232,15,190,143,139,42,61,126,82,109,188,83,177,49,189,216,159,68,189,180,115,154,189,149,211,94,61,251,201,152,188,138,202,6,189,44,44,40,62,254,13,90,189,246,10,11,61,90,156,177,188,235,86,79,188,177,192,23,189,76,107,211,186,158,178,90,189,164,199,111,188,68,20,147,60,179,205,237,189,165,21,223,188,212,72,11,61,109,230,16,189,192,5,217,60,117,147,24,189,119,220,144,61,24,67,153,61,234,32,175,188,89,105,18,190,169,77,252,61,236,106,114,59,119,15,208,60,99,8,128,60,42,116,158,61,178,159,5,61,239,254,248,61,93,220,198,61,252,252,119,58,128,212,102,189,89,76,44,61,47,22,6,60,87,147,167,189,89,196,208,189,181,22,134,61,114,51,92,59,58,206,141,61,19,130,149,61,135,139,92,189,247,116,53,189,17,143,164,61,241,18,188,189,85,103,53,61,247,5,244,59,159,61,247,189,144,50,98,188,73,160,193,188,101,85,132,189,148,80,250,60,10,191,148,61,181,109,152,61,254,186,179,189,179,152,216,188,213,202,132,61,24,94,73,61,255,121,186,61,15,183,195,60,103,125,10,61,148,75,227,188,238,94,238,61,151,88,217,61,138,3,104,189,2,44,114,188,100,4,20,61,162,125,44,187,141,96,99,61,136,132,143,61,176,228,138,61,72,225,250,188,7,64,92,61,16,174,160,189,75,232,174,188,80,114,231,189,171,65,88,61,217,206,55,61,54,63,158,189,51,169,33,188,144,219,207,61,28,123,150,61,168,115,197,188,68,76,73,61,202,52,154,187,77,135,206,188,9,21,92,189,169,189,72,189,87,148,18,189,254,241,94,61,131,134,62,61,195,15,206,60,104,117,50,189,233,126,14,189,10,17,112,189,113,29,227,59,43,105,69,60,203,186,63,61,46,140,4,190,92,59,209,60,52,103,253,188,170,182,155,57,236,107,93,189,49,39,56,62,86,241,166,61,157,156,161,59,125,5,233,188,208,11,151,189,66,37,46,60,15,237,163,61,120,40,202,61,143,167,101,188,213,234,107,61,250,97,132,58,110,193,146,61,36,98,138,189,163,86,152,61,146,7,226,61,126,114,148,188,107,186,222,189,213,204,26,61,61,182,229,60,192,151,66,189,75,114,0,189,230,146,202,189,88,114,21,189,204,207,141,188,30,164,167,186,205,92,96,188,102,220,84,61,155,141,21,61,186,162,180,61,197,56,255,60,61,240,49,189,80,54,133,189,182,101,192,60,27,47,221,60,155,144,214,61,194,164,120,188,132,188,30,189,155,231,136,187,146,148,116,59,199,161,126,61,30,250,174,61,29,115,158,189,65,43,208,189,233,95,242,189,37,173,248,59,2,97,103,189,32,124,168,61,159,233,165,60,108,233,17,189,0,58,12,61,28,122,203,189,166,211,122,189,86,241,198,188,107,74,178,59,45,150,34,189,198,163,212,188,38,138,144,187,23,103,76,61,189,58,71,59,138,115,20,61,32,240,192,60,13,82,240,187,224,14,4,62,85,47,159,189,124,97,114,189,88,58,159,188,93,192,203,188,44,46,142,59,86,11,172,61,21,227,156,189,55,110,209,189,107,97,22,61,30,51,16,189,190,105,250,187,158,239,167,187,145,15,250,188,31,104,197,61,59,167,89,189,168,167,15,187,83,148,203,188,34,113,79,61,107,241,41,61,168,224,48,189,42,173,63,61,58,118,80,189,204,95,97,61,200,11,9,62,233,182,196,188,238,150,100,58,84,196,105,189,150,38,37,186,152,81,44,61,113,113,4,190,206,166,131,189,236,249,26,61,14,249,135,189,164,108,145,59,90,99,0,62,15,211,126,189,170,44,138,189,184,174,184,61,16,205,60,189,60,189,210,188,181,255,161,61,228,105,153,189,58,30,51,189,65,126,150,189,50,176,142,61,42,57,167,188,205,172,165,184,113,172,75,189,77,76,247,189,26,110,64,189,228,103,35,61,165,20,148,61,202,135,32,60,66,237,183,59,118,53,57,189,161,218,224,59,149,159,20,61,180,58,153,61,240,21,221,187,138,30,120,60,25,143,146,189,154,234,73,60,229,209,141,186,128,14,115,60,18,194,163,61,55,197,227,188,92,173,211,61,78,237,140,188,218,89,116,60,161,48,104,189,232,136,252,60,164,255,229,60,166,126,94,59,184,6,150,189,54,234,225,61,114,106,103,61,185,225,55,189,165,135,225,61,205,89,223,189,159,58,86,189,79,61,210,186,221,69,184,189,46,1,120,189,113,202,220,61,200,151,208,60,151,198,143,189,217,122,6,186,25,198,253,189,127,109,61,61,0,226,174,189,123,79,197,61,250,97,196,61,129,4,133,189,122,26,144,61,204,96,12,61,220,183,26,61,246,151,157,189,141,181,255,61,74,150,19,188,99,185,37,188,252,194,171,61,34,227,81,61,180,90,32,61,130,202,120,60,131,192,170,61,130,230,243,60,154,65,60,189,229,155,205,61,31,77,117,59,241,156,13,190,74,7,43,189,166,11,49,60,140,188,108,61,54,233,22,190,51,81,196,61,63,173,34,188,152,167,211,189,126,87,4,189,72,109,226,189,129,148,248,61,216,186,20,62,66,233,139,60,204,10,165,189,44,17,168,60,245,17,56,189,185,167,43,188,190,17,29,61,213,37,99,187,18,19,212,186,46,144,160,60,57,70,178,188,90,126,0,62,185,111,53,60,4,202,134,61,132,15,37,61,252,195,22,60,179,180,83,189,226,203,4,62,65,72,6,190,97,107,54,61,142,149,24,60,245,244,209,61,160,81,154,189,134,145,94,61,144,19,166,60,127,103,59,189,157,99,0,61,158,98,213,57,20,66,199,189,147,26,218,185,89,165,244,187,143,52,56,189,137,68,161,189,77,186,45,61,42,114,136,61,116,93,248,60,253,245,138,189,88,143,123,61,161,128,237,188,177,219,103,61,51,81,132,59,7,126,20,189,120,242,105,188,114,108,189,60,202,81,0,188,168,167,15,185,142,201,226,188,40,182,2,190,85,189,252,187,98,75,15,188,135,22,217,188,199,213,72,61,250,183,59,190,46,26,114,61,39,49,136,61,16,118,138,60,83,36,191,189,142,149,184,61,99,97,136,60,219,253,170,189,126,229,193,188,242,150,43,188,193,54,226,60,181,140,20,62,35,133,50,58,206,196,52,61,117,172,18,189,161,186,185,59,158,67,185,189,179,209,185,189,10,247,10,189,159,29,48,61,51,196,177,60,227,83,64,189,0,56,54,61,22,161,216,188,172,230,121,189,106,164,37,60,155,0,195,188,11,66,249,60,115,244,120,188,101,86,31,190,43,219,135,188,251,206,175,60,5,54,103,187,17,224,116,189,212,242,3,61,53,9,94,58,150,118,202,189,68,192,161,189,230,229,48,61,6,14,136,61,185,55,127,61,165,249,19,62,203,243,224,59,59,55,141,189,103,70,63,61,249,129,203,61,247,147,49,61,76,112,106,188,210,254,7,189,202,84,65,187,178,216,38,61,238,233,170,61,246,12,33,61,196,92,82,61,104,8,199,59,209,116,150,189,96,116,185,189,45,95,247,189,225,155,38,189,129,66,189,61,166,99,174,189,26,194,177,188,250,122,190,59,113,56,211,61,77,129,204,60,161,157,211,60,115,156,155,189,29,57,18,61,57,185,223,188,222,173,28,190,35,45,21,61,250,237,107,61,161,45,167,61,221,94,210,58,98,247,93,189,25,88,7,189,9,196,107,188,64,49,146,189,123,49,20,61,239,225,18,61,26,110,64,189,43,221,29,61,30,83,55,189,62,207,159,189,181,194,244,188,105,30,160,61,54,115,168,61,183,213,44,60,237,98,90,61,28,152,28,189,137,94,134,189,114,140,100,61,203,157,25,61,22,76,156,61,226,35,226,188,218,142,41,60,161,76,195,61,203,134,181,189,140,17,73,61,56,18,232,61,117,61,81,61,128,15,30,61,157,157,12,61,187,41,101,189,218,112,24,189,199,155,124,188,222,85,15,190,154,181,20,61,84,255,32,61,121,5,34,188,140,243,55,189,189,166,135,60,23,183,81,184,205,60,217,61,247,88,122,60,1,248,39,187,245,103,223,189,185,141,70,189,168,170,16,189,234,202,39,62,22,23,7,61,158,10,56,189,19,124,83,59,149,97,252,189,2,75,46,188,243,61,99,61,70,65,112,187,73,247,147,189,206,166,227,189,22,222,133,61,78,41,47,60,63,59,32,61,126,199,240,186,49,40,243,189,247,199,123,61,71,30,8,187,72,138,8,189,147,111,118,189,210,167,213,188,78,183,236,186,183,13,163,189,82,73,157,184,144,16,165,61,138,202,6,61,246,238,15,189,89,133,77,187,189,195,237,188,46,201,193,61,224,46,155,189,150,148,187,188,1,195,114,188,128,45,111,61,188,92,228,189,78,181,22,61,30,27,129,188,225,155,230,189,241,103,248,60,196,234,175,61,17,172,170,188,24,179,101,61,44,129,212,189,126,253,240,61,147,198,40,189,216,188,42,61,90,184,172,189,158,6,12,61,103,42,68,60,72,221,206,187,166,67,39,61,154,67,18,189,216,245,11,61,117,59,251,61,13,80,186,61,94,213,89,189,1,47,115,189,31,103,186,61,41,93,186,189,91,150,239,189,250,39,184,58,75,175,13,62,251,35,140,60,71,58,131,189,120,240,211,61,130,29,255,188,43,81,246,188,17,168,62,61,159,172,8,190,221,65,44,189,188,201,15,62,5,22,0,190,192,64,16,61,64,78,152,186,210,24,173,188,65,42,69,188,120,128,199,61,230,205,161,189,236,221,31,189,163,58,93,189,29,87,19,62,63,116,161,61,109,140,29,186,0,115,173,188,241,104,35,189,168,53,205,188,28,95,155,61,51,166,32,61,174,242,4,61,229,125,28,61,75,57,31,189,14,22,174,189,47,22,6,189,212,210,220,188,204,127,232,61,36,15,196,188,216,98,247,61,156,25,125,187,139,192,216,188,170,13,14,190,182,106,183,61,154,149,237,60,182,100,85,189,74,127,175,189,89,224,235,61,122,0,171,61,10,19,198,60,72,193,243,61,240,82,138,189,116,8,156,60,14,21,227,188,73,76,176,189,169,160,98,189,126,141,164,60,118,227,221,188,192,6,68,189,189,227,84,189,30,51,16,189,153,16,115,189,184,116,140,189,224,102,113,61,49,205,52,61,49,124,164,189,88,60,245,61,169,137,62,189,183,70,132,189,179,235,222,188,234,94,23,62,15,186,4,61,120,185,136,60,253,20,199,60,21,58,175,61,130,226,199,186,255,233,134,60,43,76,31,61,57,9,165,188,129,95,163,60,45,152,56,61,74,239,27,61,108,176,176,189,131,25,211,188,172,2,53,61,77,47,209,61,131,163,132,189,236,193,100,61,168,229,71,61,249,76,246,188,124,15,23,188,209,232,238,189,64,222,139,61,63,227,66,61,61,238,155,189,30,253,143,189,88,229,66,61,70,7,228,189,92,145,152,59,21,226,145,187,181,83,243,60,21,143,139,187,155,90,54,60,234,174,108,60,115,18,42,62,110,250,115,61,30,27,129,58,112,122,87,189,185,26,89,60,162,124,193,61,198,135,217,61,229,237,136,60,63,143,209,188,4,89,207,189,6,75,149,61,156,140,234,189,207,47,202,60,96,175,48,60,63,1,84,189,84,170,4,61,157,160,77,189,148,161,170,189,45,92,86,61,5,197,15,189,107,11,239,189,215,247,225,189,133,176,90,189,92,58,134,61,40,10,244,188,112,149,167,188,39,136,10,62,157,185,135,187,78,94,228,61,127,109,253,188,19,244,151,60,188,89,131,188,79,36,152,60,90,184,172,189,134,32,71,189,136,130,153,188,241,70,198,189,219,166,184,189,184,1,159,60,236,51,39,189,120,156,34,188,207,135,199,189,89,49,188,61,96,57,2,61,191,129,201,188,78,9,8,190,138,119,160,61,94,247,182,61,60,106,140,189,185,56,170,188,90,212,39,61,120,11,100,189,173,48,45,62,118,226,242,60,249,20,160,61,200,148,79,189,103,181,192,187,111,72,163,187,210,167,213,189,52,130,141,189,242,7,3,62,131,165,58,60,183,150,73,186,223,163,126,61,52,132,163,189,107,128,210,58,136,218,182,61,191,67,17,189,0,145,254,60,212,209,241,60,152,218,210,189,77,158,50,188,41,34,131,189,226,32,161,188,187,124,107,61,20,62,155,61,21,226,17,188,167,205,120,189,134,173,89,189,1,248,167,59,169,251,128,61,218,117,175,61,215,250,162,60,213,232,213,61,194,24,177,189,68,22,105,61,224,161,104,61,75,2,84,188,44,240,21,61,203,247,12,188,230,174,37,189,52,73,44,61,246,64,43,61,43,193,226,60,183,240,188,189,119,218,186,61,193,202,33,189,149,215,202,60,25,58,182,189,75,118,140,61,2,212,180,61,64,190,68,189,21,226,145,188,229,213,57,61,73,46,255,61,180,171,16,189,189,115,104,61,60,244,189,61,82,73,93,61,183,209,128,188,179,178,125,189,227,193,22,61,30,81,161,61,191,154,131,188,132,43,32,59,171,174,195,188,137,209,147,189,40,10,244,188], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE+30720);
/* memory initializer */ allocate([62,5,192,187,112,151,125,60,205,61,4,62,202,106,186,189,40,101,146,61,7,8,134,189,247,63,192,59,120,71,198,187,234,6,202,61,109,140,93,61,1,76,153,60,171,152,10,61,105,227,8,188,246,210,84,189,53,70,107,61,254,38,36,62,232,47,244,186,33,30,137,60,65,14,10,189,8,232,126,61,33,35,16,190,84,252,223,60,40,16,118,61,187,185,248,60,115,104,241,189,28,240,121,61,200,150,229,188,32,182,180,189,110,219,119,187,133,204,21,190,34,166,164,189,34,255,76,61,88,3,20,61,119,190,159,60,234,3,137,61,135,191,166,60,5,77,203,60,152,106,102,189,207,76,16,190,124,185,175,189,129,67,168,60,4,115,116,187,237,72,37,62,11,96,74,189,93,163,101,57,231,224,25,187,179,93,97,189,54,229,138,61,194,132,1,62,213,119,254,188,9,83,244,189,162,154,210,189,44,129,148,58,118,168,38,60,125,149,220,61,181,111,238,188,122,254,116,189,164,80,22,61,36,238,177,188,243,230,48,189,72,196,20,187,145,209,1,189,74,94,29,60,240,251,183,188,254,41,21,189,81,218,91,61,99,39,124,61,33,116,80,188,190,246,76,61,32,65,241,188,102,48,6,62,63,2,255,189,97,82,220,189,224,104,71,188,54,177,64,60,252,83,42,59,51,192,133,60,11,66,121,189,36,180,165,189,145,237,252,60,81,105,68,187,71,201,171,188,85,164,66,188,26,83,176,189,157,73,27,61,115,129,75,60,248,80,98,61,104,145,237,187,144,247,42,61,162,184,99,61,116,12,200,188,97,226,143,188,168,52,162,189,185,196,17,60,198,105,56,62,232,48,95,61,116,66,232,58,4,118,181,188,200,8,168,189,168,255,44,188,77,76,39,190,41,63,169,188,238,9,146,188,72,80,252,188,128,211,59,189,121,175,250,61,232,221,88,189,44,159,5,190,189,112,199,61,207,19,239,189,255,62,35,61,189,112,103,61,167,233,115,189,53,122,117,189,169,216,152,188,53,241,14,61,74,211,96,61,254,15,176,59,87,204,136,189,169,106,2,190,180,113,68,61,145,239,146,61,240,138,224,60,8,142,203,187,121,176,197,60,148,163,192,189,112,238,175,59,92,62,18,188,151,173,149,61,191,183,105,188,58,61,239,188,232,217,204,189,149,156,147,189,191,10,112,60,207,16,142,61,2,188,69,61,127,218,136,189,145,71,176,61,54,119,116,60,79,59,124,188,160,226,56,189,183,211,214,60,50,116,108,58,254,127,28,189,229,67,16,189,30,25,107,61,168,229,199,61,67,231,149,189,201,117,83,61,183,42,9,189,23,216,227,60,214,168,7,59,83,179,199,189,111,16,109,189,103,184,1,62,84,85,168,189,188,173,148,189,23,17,197,59,199,215,190,189,77,15,138,188,24,178,186,188,184,200,13,62,39,192,176,59,209,92,103,189,70,125,210,61,113,229,236,60,67,203,58,189,141,237,117,189,114,82,248,61,171,178,239,60,230,172,207,189,143,166,122,61,231,83,7,61,246,155,137,188,82,156,131,61,56,106,133,61,197,254,50,60,42,167,189,60,115,105,220,61,6,48,229,60,145,12,185,189,125,173,203,188,163,6,211,187,85,19,68,61,174,128,66,189,248,167,180,61,168,226,70,188,217,208,237,189,39,160,9,186,21,88,16,190,29,5,136,60,12,7,130,61,118,56,186,188,90,72,64,189,145,39,137,61,240,250,140,189,83,62,132,60,148,165,214,60,122,137,49,189,84,224,132,189,218,202,203,60,194,47,149,189,245,216,246,61,143,138,159,61,73,160,65,61,226,231,63,60,185,222,54,189,80,168,39,61,223,251,155,61,63,83,207,189,40,155,242,188,150,92,133,189,185,193,80,61,5,167,190,188,164,52,91,61,121,59,194,60,73,102,245,187,23,186,18,61,37,3,192,60,84,113,99,189,66,39,132,187,132,17,251,187,233,185,197,189,104,62,167,189,41,33,24,61,14,221,12,62,96,173,154,61,252,171,199,189,120,238,253,61,123,79,101,60,173,47,178,61,114,26,162,188,41,6,168,189,243,33,168,60,192,66,230,59,93,110,176,188,143,137,20,189,11,69,186,189,194,252,53,190,49,120,24,188,213,233,0,189,128,40,24,188,33,203,66,61,70,208,184,189,143,251,182,61,121,233,102,61,173,107,180,187,93,163,229,189,199,188,142,59,40,239,131,61,27,155,29,189,230,30,18,189,246,92,38,61,84,84,253,59,232,20,36,62,197,255,93,189,240,248,246,187,250,183,75,60,113,59,180,60,71,173,176,188,15,239,153,189,26,109,213,188,151,83,130,60,88,255,39,61,6,217,178,60,248,226,11,61,213,208,70,189,45,120,177,189,169,106,66,61,63,200,50,58,72,167,46,61,54,32,194,60,114,140,196,189,65,98,187,188,87,118,193,185,163,172,95,59,189,111,60,61,136,185,132,61,126,252,37,60,27,160,4,190,170,239,188,189,77,135,238,61,50,89,92,61,59,25,28,61,125,121,193,61,255,4,151,60,151,141,14,189,225,182,150,61,142,229,221,61,73,48,213,61,42,83,76,61,208,70,174,188,197,4,181,60,166,212,133,61,179,65,134,61,225,236,182,61,52,131,248,57,183,42,137,187,253,219,37,189,105,59,134,189,118,83,170,189,224,190,142,188,210,109,73,61,100,61,53,189,246,155,9,60,245,161,139,61,32,126,30,62,113,174,225,60,195,68,3,188,216,240,116,60,27,43,49,61,144,50,34,61,96,176,11,190,76,82,153,188,219,138,125,61,162,13,0,61,36,13,110,61,7,95,24,189,164,227,234,189,81,162,165,189,23,16,90,189,196,150,158,61,121,1,118,60,142,121,189,189,123,47,190,59,92,58,134,189,205,60,185,187,126,225,149,189,201,198,195,61,8,230,168,61,154,207,121,61,11,93,137,185,95,127,18,189,29,227,170,189,137,39,251,61,67,26,181,61,101,225,107,188,195,14,99,189,34,111,185,187,77,189,142,61,25,230,132,189,138,146,16,60,182,244,168,61,113,113,84,61,35,190,19,189,150,209,8,61,226,175,169,189,48,242,178,189,93,221,49,59,96,231,198,189,103,10,157,188,127,166,222,60,1,24,143,189,35,162,24,188,238,90,66,61,244,135,38,61,41,235,119,61,94,99,151,59,221,235,36,189,116,212,81,189,164,193,237,188,198,49,146,189,208,181,207,61,70,69,28,60,129,33,203,189,107,43,118,61,214,57,70,189,107,39,202,188,242,210,205,60,88,141,101,189,152,192,109,189,248,108,93,189,57,211,4,60,197,171,172,60,2,130,57,61,84,55,151,188,195,40,232,189,1,134,101,60,163,172,223,187,61,13,88,189,72,49,64,61,78,153,155,189,248,226,11,60,173,223,172,189,212,41,143,187,212,153,59,61,31,103,154,61,142,233,137,189,120,208,108,60,52,189,4,61,27,101,189,61,221,95,125,189,7,236,170,189,217,180,82,61,158,210,1,61,51,81,164,189,119,76,93,61,27,47,221,60,220,160,150,189,1,77,4,61,19,130,21,61,245,131,58,188,210,58,170,188,41,62,254,189,68,81,192,61,131,24,232,188,55,80,32,61,70,126,253,188,224,189,163,61,246,12,225,186,152,251,100,60,34,171,27,61,207,129,229,186,14,159,52,189,94,241,4,62,16,175,107,60,142,118,220,186,69,246,129,189,151,143,36,187,27,13,160,189,44,160,16,190,249,218,179,60,31,188,214,61,194,247,190,189,124,214,117,189,29,91,143,61,125,37,144,59,143,113,197,189,222,0,115,61,187,12,127,189,193,56,152,189,34,80,221,61,228,105,185,189,176,255,58,189,110,24,69,61,79,120,73,61,75,118,44,61,152,19,52,61,190,108,187,189,153,154,68,189,217,151,236,188,26,83,144,61,41,236,98,61,148,193,209,188,139,27,55,60,186,218,10,60,5,78,182,60,207,188,28,61,204,10,69,61,159,59,65,61,136,47,147,188,18,221,51,188,218,200,181,189,188,144,14,61,26,50,158,60,203,219,1,62,253,49,45,188,19,99,89,61,77,188,3,61,234,120,76,186,81,218,27,190,106,133,105,188,224,216,179,188,90,47,6,190,103,101,123,189,230,35,233,61,199,186,120,61,145,124,165,60,210,252,209,61,131,165,58,188,48,46,85,189,141,151,142,189,250,99,186,189,27,156,200,189,94,243,138,61,191,70,146,60,236,249,90,189,6,159,38,189,250,42,249,189,58,31,158,189,89,248,218,189,55,141,109,61,60,220,142,61,200,179,75,188,49,122,142,61,103,238,97,189,119,43,203,188,82,152,119,189,23,72,208,61,136,132,111,60,233,212,21,61,215,78,148,187,3,119,192,61,193,26,231,188,153,99,57,61,101,84,25,62,133,178,112,188,119,102,2,188,34,27,200,61,237,101,219,61,208,69,163,189,169,218,238,60,79,202,164,60,16,176,214,61,124,127,131,189,115,16,244,61,201,33,34,61,189,56,241,188,178,47,217,59,89,24,226,189,135,26,133,59,15,38,69,61,193,56,120,189,201,203,26,60,31,20,84,61,178,155,89,189,145,14,79,61,186,46,252,186,238,5,230,60,210,84,79,189,148,109,96,188,130,168,251,58,71,142,180,61,235,169,149,61,74,181,175,61,38,200,136,189,29,201,101,60,38,229,46,61,133,120,52,62,60,45,63,189,131,161,14,189,105,171,82,189,14,77,249,61,134,200,105,189,8,204,195,60,144,160,56,61,172,55,106,189,254,96,96,61,201,142,141,188,182,49,22,190,98,248,8,59,25,230,132,188,50,171,55,189,235,26,173,189,116,35,28,190,114,221,148,61,125,33,228,187,149,184,14,60,144,131,2,62,125,4,126,187,102,192,89,61,120,42,96,188,77,246,207,188,248,222,223,185,112,64,203,188,179,125,200,188,58,120,102,189,89,109,126,61,231,113,248,189,16,34,89,189,8,116,134,61,115,99,154,189,143,54,14,188,114,23,129,189,90,16,170,61,50,118,226,61,48,98,31,185,191,16,2,190,152,251,100,61,0,202,95,60,19,153,185,59,159,232,58,187,30,135,65,61,102,217,147,58,19,98,206,61,159,172,24,61,180,1,216,60,38,223,44,189,94,76,179,60,9,221,165,188,49,39,104,189,54,171,158,189,138,232,183,61,142,148,109,61,117,199,34,61,34,114,218,61,77,15,138,188,182,215,130,188,25,30,155,61,235,0,72,189,59,227,123,60,89,195,5,189,121,177,0,190,160,50,126,189,179,37,107,189,20,8,123,189,49,208,149,61,36,67,78,61,25,84,91,61,6,75,117,189,218,29,82,189,44,97,109,61,162,38,122,187,145,180,155,61,211,105,221,59,110,77,122,61,88,197,27,189,97,165,18,62,6,215,188,61,162,126,151,188,217,36,127,61,226,114,188,59,140,75,21,189,110,104,138,61,171,208,0,61,205,173,208,61,90,98,165,189,105,169,60,60,201,176,74,189,190,49,132,188,236,217,179,189,70,237,222,61,172,142,28,61,170,101,203,189,149,70,76,187,117,33,86,61,223,49,220,61,14,105,20,189,181,224,133,61,232,131,37,61,62,151,105,189,31,218,7,189,189,112,167,189,169,194,159,188,73,246,8,61,223,248,90,60,107,125,145,188,210,56,212,188,191,214,165,188,0,57,161,189,198,164,63,188,40,100,231,188,204,150,140,61,40,241,217,189,212,210,220,60,162,241,132,189,160,110,128,61,216,72,146,188,10,45,27,62,31,188,54,61,64,251,145,188,64,217,20,60,144,73,6,189,9,80,211,188,202,55,155,61,77,247,154,61,96,120,37,189,107,216,111,61,253,160,46,189,235,116,192,61,220,213,203,189,214,228,105,61,173,167,150,61,1,24,79,60,239,116,135,189,158,35,242,60,51,168,118,61,98,106,171,189,235,116,96,189,76,170,246,189,110,21,196,185,29,174,213,59,116,92,13,61,146,7,34,189,120,208,44,61,7,182,10,61,194,249,212,61,23,98,117,188,129,123,158,189,228,73,82,189,115,127,245,58,251,91,66,61,152,252,15,62,161,219,203,188,255,120,175,188,214,227,62,189,111,185,250,60,213,38,206,61,137,96,156,61,222,1,158,188,17,223,201,189,148,107,234,189,43,217,49,188,128,244,13,189,215,220,209,60,86,240,91,187,187,11,180,189,214,199,131,61,183,180,154,189,135,136,187,189,102,131,204,188,187,238,173,188,92,90,141,188,123,48,105,189,122,108,75,187,214,141,247,60,236,193,164,188,140,20,74,188,163,148,16,61,250,39,184,58,148,162,37,62,113,86,132,189,172,228,131,189,249,132,236,187,130,168,251,184,45,93,65,189,117,200,237,61,204,70,103,189,10,162,142,189,177,108,230,187,35,21,70,188,133,91,190,188,111,18,131,60,108,7,35,189,143,52,152,61,2,129,78,188,241,131,115,60,88,230,109,189,154,233,190,61,0,253,126,61,182,19,37,189,115,128,224,60,122,197,3,190,77,134,35,61,8,57,239,61,134,202,63,188,127,133,76,60,101,251,144,188,244,224,110,59,194,164,248,187,163,29,247,189,153,160,6,189,199,156,135,61,132,97,0,189,166,241,11,189,149,216,21,62,221,209,255,188,111,241,0,190,15,42,241,61,132,215,46,189,71,86,126,189,113,61,74,61,159,233,229,189,75,143,38,60,19,187,150,189,42,111,71,61,160,196,231,60,108,118,164,60,93,191,128,189,76,82,217,189,242,65,207,188,65,11,137,61,131,218,239,60,208,240,230,60,51,221,107,187,222,90,38,189,190,220,167,60,31,188,118,61,61,13,88,61,210,58,42,188,35,105,183,188,215,193,129,189,241,42,235,188,56,19,19,61,212,239,66,188,84,59,163,61,199,72,118,187,52,217,159,61,2,98,146,188,123,49,20,60,36,128,155,188,230,64,15,61,53,36,142,61,12,231,154,188,170,40,30,189,123,216,171,61,109,255,10,61,57,241,21,189,124,12,182,61,13,114,87,189,189,25,117,189,198,24,88,61,17,229,139,189,149,72,130,189,134,30,1,62,30,254,26,188,177,191,44,189,77,19,54,188,64,166,149,189,33,88,85,61,5,135,87,189,52,161,73,61,210,1,137,61,70,12,59,189,157,129,241,61,101,198,91,61,161,242,47,188,128,17,52,189,5,79,17,62,139,225,234,58,241,71,17,189,184,177,185,61,1,50,52,61,57,185,95,188,210,142,155,60,191,70,2,62,17,1,135,58,209,65,151,186,53,155,167,61,195,160,204,188,195,98,212,189,133,148,159,189,197,203,19,61,237,182,139,61,234,207,126,189,70,235,232,61,99,12,44,188,173,194,134,189,202,108,80,61,86,157,213,189,27,186,249,61,157,17,229,61,221,152,30,60,10,47,65,188,200,206,219,58,146,122,15,189,149,238,46,60,56,75,201,60,192,178,82,188,241,103,248,188,150,121,43,188,142,203,56,60,46,199,43,62,89,133,77,59,29,175,224,61,187,241,238,59,57,94,129,58,183,208,149,59,64,161,222,61,53,209,231,189,101,171,75,188,71,114,121,188,98,215,150,61,188,5,82,189,183,152,159,61,196,237,80,188,233,210,63,188,173,49,104,60,138,32,206,60,138,85,195,189,16,31,216,60,160,168,236,188,12,230,111,189,210,110,4,190,64,166,53,60,24,181,123,61,162,8,105,61,154,149,109,189,230,36,212,61,23,215,120,189,87,147,167,61,76,84,47,189,143,255,130,188,201,62,200,188,191,44,237,60,139,164,93,188,136,132,47,61,224,189,163,60,2,184,41,190,225,12,254,188,203,14,113,188,175,121,213,188,195,213,1,61,54,145,9,190,206,112,3,61,123,159,170,60,30,168,83,61,1,20,3,190,98,78,80,61,184,6,182,60,252,141,150,189,205,6,25,188,217,96,97,60,167,31,20,61,156,137,201,61,150,120,192,188,218,113,195,60,241,13,5,60,184,6,182,60,10,242,211,189,180,33,63,189,2,43,7,189,94,46,130,61,44,103,239,60,77,246,79,188,25,114,172,61,252,171,71,60,96,229,80,189,49,6,214,60,0,84,49,189,150,33,14,60,199,76,162,188,28,8,41,190,24,120,110,188,2,71,66,189,196,95,147,60,150,35,36,189,123,135,219,61,127,23,182,60,177,81,182,189,1,251,136,189,171,178,111,60,139,226,149,61,200,40,143,61,34,193,148,61,128,129,160,60,204,36,42,189,34,52,2,61,6,13,189,61,197,2,223,60,229,95,11,61,233,101,84,189,34,255,204,57,250,236,0,60,106,19,7,62,51,25,142,61,231,139,61,61,106,164,37,61,212,238,23,189,242,149,0,189,94,18,231,189,41,176,128,60,87,36,198,61,37,93,211,189,200,91,174,188,10,220,58,60,253,21,34,62,234,66,172,188,213,237,44,61,171,232,79,189,189,198,142,61,64,191,47,189,54,147,239,189,200,11,105,60,208,214,193,61,162,156,232,60,155,32,42,61,111,155,105,189,143,255,66,189,91,10,200,188,140,248,14,189,84,227,37,60,25,112,22,61,99,13,87,189,154,10,241,186,46,31,9,189,163,200,90,189,187,42,144,189,188,63,190,61,95,7,206,61,38,224,215,188,251,3,165,61,98,160,235,188,155,232,115,189,113,174,193,61,211,250,187,61,216,185,41,61,225,124,106,60,100,144,59,61,35,188,221,61,144,22,167,189,63,142,102,61,232,190,12,62,251,31,96,61,117,3,5,189,125,61,95,61,76,24,205,189,104,174,211,187,113,169,202,60,62,180,239,189,255,32,18,188,236,248,143,61,156,252,22,189,195,69,110,188,57,180,200,60,178,101,121,188,3,120,235,61,4,4,51,189,170,185,220,57,127,109,125,189,89,247,15,189,198,192,186,188,42,169,3,62,159,62,2,189,53,153,177,189,25,3,235,187,152,218,146,189,92,231,223,187,235,168,234,60,136,188,229,187,62,34,198,189,247,174,17,190,222,87,229,60,210,140,133,61,165,106,123,61,171,63,66,58,92,231,15,190,56,50,143,60,215,135,117,188,107,127,39,189,41,95,80,188,162,179,76,188,158,38,179,188,69,218,6,189,188,206,134,60,253,246,213,61,238,208,48,60,85,136,135,189,80,113,156,60,138,30,248,186,65,68,138,61,88,203,189,189,82,38,117,189,99,39,60,189,35,159,87,61,0,0,128,189,137,37,133,61,211,50,210,188,93,226,24,190,159,200,83,61,198,49,18,61,76,142,59,189,145,43,245,187,204,153,141,189,35,243,24,62,22,49,44,189,137,124,151,60,123,136,166,189,109,226,100,61,21,55,110,61,226,32,161,60,115,188,130,61,159,3,75,188,104,62,231,59,85,47,31,62,126,170,10,61,30,110,135,188,32,9,251,187,66,151,48,61,106,107,164,189,97,142,222,189,212,98,240,188,65,16,192,61,227,194,129,188,215,137,139,189,188,3,188,61,242,235,135,59,9,165,111,189,188,65,116,61,78,94,196,189,86,215,161,187,239,111,176,61,234,151,232,189,41,119,159,188,47,49,22,188,42,254,111,59,1,0,0,0,3,0,0,0,8,0,0,0,72,177,0,0,1,0,0,0,2,0,0,0,4,0,0,0,104,177,0,0,1,0,0,0,4,0,0,0,16,0,0,0,120,177,0,0,1,0,0,0,3,0,0,0,8,0,0,0,184,177,0,0,1,0,0,0,3,0,0,0,8,0,0,0,216,177,0,0,1,0,0,0,2,0,0,0,4,0,0,0,248,177,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,9,68,0,0,22,68,0,128,34,68,0,0,47,68,0,128,59,68,0,0,72,68,0,128,84,68,0,0,97,68,0,0,72,66,0,0,200,66,0,0,72,67,0,0,150,67,0,0,72,68,0,128,84,68,0,0,97,68,0,128,109,68,0,0,122,68,0,64,131,68,0,128,137,68,0,192,143,68,0,0,150,68,0,64,156,68,0,128,162,68,0,192,168,68,0,0,175,68,0,64,181,68,0,128,187,68,0,64,206,68,0,0,200,65,0,0,72,66,0,0,150,66,0,0,200,66,0,0,250,66,0,0,22,67,0,0,47,67,0,0,122,67,0,192,168,68,0,0,175,68,0,64,181,68,0,128,187,68,0,192,193,68,0,0,200,68,0,64,206,68,0,128,212,68,0,0,200,65,0,0,72,66,0,0,200,66,0,0,22,67,6,0,0,0,6,0,0,0,64,0,0,0,72,178,0,0,6,0,0,0,6,0,0,0,64,0,0,0,72,184,0,0,6,0,0,0,6,0,0,0,64,0,0,0,72,190,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,215,11,32,68,229,72,95,68,51,59,174,68,236,193,186,68,82,8,207,68,61,154,212,68,6,161,11,68,252,57,51,68,133,43,132,68,215,211,147,68,154,249,187,68,246,64,201,68,233,198,25,68,207,103,64,68,31,5,140,68,225,218,152,68,184,206,170,68,154,33,183,68,80,221,37,68,80,53,56,68,229,48,113,68,72,113,130,68,113,229,202,68,72,41,210,68,127,250,243,67,70,110,16,68,133,91,126,68,72,33,147,68,51,3,194,68,20,246,201,68,86,6,6,68,12,90,55,68,246,136,161,68,225,194,175,68,102,54,197,68,174,175,204,68,236,129,236,67,199,163,7,68,104,89,91,68,61,186,160,68,72,225,198,68,20,238,205,68,244,85,3,68,229,0,35,68,143,218,150,68,184,190,186,68,10,255,205,68,154,73,212,68,137,113,255,67,141,55,15,68,119,78,108,68,195,181,180,68,113,197,209,68,246,48,213,68,143,186,5,68,246,80,52,68,113,125,159,68,82,248,176,68,0,16,206,68,92,247,211,68,25,76,88,68,0,224,130,68,123,100,158,68,61,170,173,68,61,210,205,68,10,31,212,68,29,2,24,68,197,120,89,68,102,158,162,68,215,27,179,68,174,247,204,68,31,45,211,68,53,190,10,68,135,86,34,68,20,182,88,68,223,247,116,68,236,169,205,68,123,236,211,68,14,5,46,68,20,126,75,68,174,207,137,68,72,121,152,68,174,15,192,68,20,190,202,68,66,120,10,68,53,198,44,68,225,26,150,68,225,106,167,68,143,162,203,68,0,112,210,68,231,163,66,68,170,113,121,68,41,84,157,68,225,202,173,68,174,63,200,68,133,59,207,68,217,70,50,68,39,185,66,68,0,56,120,68,102,126,131,68,102,46,187,68,31,85,206,68,143,34,245,67,133,139,21,68,164,128,139,68,41,132,155,68,82,200,202,68,184,6,209,68,43,71,224,67,113,5,0,68,102,246,158,68,195,5,181,68,215,107,197,68,92,79,205,68,16,216,232,67,248,211,5,68,20,102,137,68,72,249,191,68,72,137,210,68,205,220,213,68,53,14,75,68,246,240,135,68,20,206,183,68,92,247,194,68,195,133,211,68,41,204,215,68,70,22,214,67,135,182,244,67,143,10,145,68,154,41,176,68,0,176,199,68,154,105,206,68,215,51,50,68,215,99,111,68,164,32,179,68,215,139,189,68,123,108,209,68,236,193,213,68,82,80,51,68,172,132,105,68,102,38,163,68,10,151,179,68,102,230,205,68,225,162,211,68,170,113,246,67,39,25,17,68,164,112,167,68,61,162,182,68,0,0,199,68,113,173,206,68,227,157,9,68,213,248,40,68,213,184,119,68,20,46,147,68,123,244,201,68,0,64,207,68,203,161,50,68,176,114,72,68,20,30,134,68,143,66,143,68,236,161,204,68,143,82,213,68,106,116,0,68,76,191,19,68,57,172,71,68,82,240,95,68,82,184,194,68,236,17,203,68,150,83,218,67,111,154,1,68,174,63,160,68,143,98,193,68,215,163,210,68,82,184,214,68,168,118,42,68,168,150,61,68,205,212,130,68,113,29,140,68,0,136,176,68,113,109,200,68,145,125,90,68,174,207,139,68,133,19,172,68,61,34,183,68,41,44,208,68,195,101,213,68,219,97,10,68,227,133,30,68,164,24,143,68,154,153,160,68,215,219,192,68,41,148,202,68,25,68,224,67,53,198,1,68,61,210,131,68,31,245,164,68,82,232,198,68,51,59,206,68,23,145,57,68,193,82,93,68,143,26,144,68,82,208,164,68,133,43,196,68,102,238,203,68,236,65,4,68,104,161,35,68,82,120,169,68,0,248,188,68,123,204,207,68,205,76,213,68,162,229,231,67,72,113,21,68,154,1,147,68,41,196,170,68,215,171,203,68,82,192,209,68,231,187,28,68,61,170,48,68,72,65,132,68,215,115,165,68,246,40,184,68,195,245,199,68,55,169,238,67,0,224,25,68,123,28,186,68,0,208,193,68,51,99,210,68,225,10,214,68,74,220,8,68,74,220,75,68,41,44,164,68,184,222,185,68,10,255,208,68,205,172,214,68,242,170,24,68,31,253,76,68,133,99,152,68,31,117,170,68,154,1,199,68,236,201,206,68,127,218,8,68,143,162,58,68,195,205,179,68,10,183,189,68,123,116,207,68,61,242,211,68,172,52,23,68,88,73,77,68,20,62,142,68,72,201,169,68,20,222,199,68,123,244,206,68,215,123,3,68,76,47,26,68,41,132,132,68,143,106,178,68,51,43,199,68,92,47,207,68,0,160,27,68,39,137,62,68,205,212,164,68,184,94,176,68,215,67,202,68,236,1,210,68,96,117,218,67,80,37,1,68,72,201,173,68,133,123,184,68,184,86,199,68,174,55,204,68,43,31,70,68,174,231,128,68,215,83,170,68,195,21,184,68,82,40,206,68,51,43,212,68,127,218,228,67,63,141,3,68,211,125,88,68,10,15,140,68,143,154,195,68,246,40,203,68,246,152,3,68,113,13,28,68,205,180,158,68,92,199,171,68,61,194,194,68,184,158,202,68,78,226,241,67,82,96,15,68,31,21,180,68,195,13,189,68,215,203,202,68,236,233,208,68,231,67,110,68,246,64,149,68,113,21,177,68,61,122,189,68,61,218,209,68,184,198,214,68,55,249,249,67,233,214,28,68,20,126,162,68,92,71,174,68,113,101,205,68,143,170,210,68,70,46,34,68,150,139,81,68,0,48,153,68,102,238,172,68,184,174,204,68,113,117,211,68,162,37,40,68,102,166,127,68,184,70,168,68,0,120,180,68,205,100,206,68,195,237,211,68,80,117,17,68,106,188,40,68,176,202,110,68,0,32,127,68,0,80,171,68,133,227,187,68,39,9,6,68,252,33,35,68,225,122,155,68,164,104,164,68,51,35,178,68,92,55,188,68,182,35,12,68,154,169,68,68,31,21,153,68,92,191,171,68,236,193,203,68,195,85,210,68,68,251,19,68,53,238,67,68,0,128,117,68,236,153,142,68,133,179,197,68,246,40,203,68,94,34,9,68,137,33,33,68,221,28,107,68,174,23,131,68,123,188,194,68,92,47,201,68,160,58,1,68,49,208,52,68,102,254,141,68,20,166,163,68,143,2,200,68,92,175,208,68,176,66,213,67,219,9,253,67,92,55,182,68,164,224,191,68,51,43,205,68,102,206,209,68,25,76,33,68,20,38,66,68,236,49,127,68,61,2,155,68,0,160,199,68,102,22,206,68,184,70,31,68,86,94,107,68,184,70,155,68,174,143,171,68,102,214,205,68,154,217,211,68,152,206,44,68,6,9,69,68,215,67,150,68,123,220,161,68,10,95,203,68,164,56,210,68,31,197,46,68,236,169,93,68,205,156,162,68,246,232,174,68,20,126,197,68,72,217,205,68,127,48,142,64,230,174,76,66,224,161,238,64,151,127,219,193,120,11,148,193,89,151,145,193,236,81,78,66,51,68,125,66,79,30,103,66,235,162,48,194,1,222,147,193,172,226,221,192,106,60,162,193,148,246,173,193,76,108,149,64,170,160,80,66,93,126,243,65,204,110,19,66,25,226,232,193,100,117,180,192,141,11,93,192,186,26,124,194,213,137,163,193,84,99,152,193,89,163,58,64,127,89,35,66,203,161,132,65,104,98,79,194,156,4,26,66,229,97,145,65,228,148,165,193,105,111,54,193,29,120,18,194,143,228,132,193,4,150,99,194,115,104,194,193,115,232,161,193,203,16,213,65,245,121,4,66,247,6,221,65,72,255,18,194,50,213,204,193,202,242,91,66,197,172,55,63,9,138,184,65,38,211,176,193,249,160,58,65,155,230,47,65,209,226,122,194,160,9,174,65,91,83,170,65,223,195,244,192,162,180,145,192,252,123,27,193,155,3,25,193,48,240,118,192,251,92,200,65,12,60,23,193,254,154,193,64,185,54,171,64,122,135,61,66,229,114,98,66,131,64,216,193,41,92,197,193,56,161,155,64,41,232,102,190,150,50,211,65,29,73,214,65,154,177,212,191,174,88,123,66,86,31,158,193,185,211,8,193,118,108,12,193,42,186,16,193,141,122,252,192,71,242,225,65,156,98,12,194,103,196,175,193,16,122,109,65,129,166,203,65,59,129,96,194,113,44,73,194,176,131,183,193,22,251,124,193,184,35,158,64,8,61,222,65,91,136,5,65,79,175,45,65,65,14,72,192,179,152,126,192,23,72,74,65,67,237,80,194,171,254,20,66,169,211,100,194,51,51,104,193,140,74,177,192,143,194,87,65,144,49,117,65,23,183,191,193,12,130,170,193,138,159,156,65,34,142,98,65,206,106,93,194,175,212,52,194,199,75,40,65,53,47,44,66,32,227,199,193,134,201,154,193,227,199,221,65,184,192,0,66,190,65,160,65,147,169,194,65,136,163,145,194,173,186,76,194,237,13,251,193,8,61,168,192,86,31,47,194,101,25,98,65,21,29,141,65,190,246,28,65,61,10,65,194,223,96,210,193,58,146,48,194,104,51,255,193,104,17,180,65,146,149,239,190,150,231,235,64,127,77,249,192,212,43,73,193,245,219,216,65,197,114,21,65,199,41,103,65,213,120,104,65,44,55,13,65,236,0,100,66,83,150,130,193,36,168,1,194,224,45,168,193,174,216,1,66,192,108,66,66,73,46,26,66,96,89,28,65,65,14,234,63,206,25,56,65,92,79,47,194,170,2,181,193,86,159,238,193,180,200,89,65,35,178,26,65,83,22,126,194,124,242,63,193,159,142,47,64,102,70,147,194,226,216,167,193,218,201,131,192,127,217,246,64,45,33,192,65,105,227,18,192,33,234,217,192,2,60,211,193,189,210,174,193,110,180,130,193,236,47,129,193,104,162,15,66,87,91,69,192,174,187,117,64,130,51,41,66,157,0,140,65,113,125,88,66,85,1,67,194,111,240,109,193,157,128,24,194,18,165,116,65,213,149,234,64,33,95,84,66,236,192,94,65,37,117,42,65,143,194,194,65,248,194,132,193,193,74,128,193,229,144,4,66,29,73,26,66,104,51,208,193,2,43,176,65,80,252,122,65,24,38,84,65,170,130,123,65,217,159,69,194,64,164,251,65,154,8,35,65,89,48,97,62,186,131,208,63,78,122,131,64,115,104,100,65,102,230,105,66,197,85,149,191,137,129,82,66,167,249,45,66,150,83,179,67,139,44,225,194,49,249,171,66,236,81,80,66,31,133,83,194,113,61,121,195,103,68,73,193,19,126,212,192,219,10,4,194,207,218,193,63,185,77,73,66,184,111,118,66,163,35,218,192,154,8,101,65,52,128,98,65,146,139,86,66,208,53,167,66,45,178,24,66,59,1,144,193,20,110,37,66,145,126,57,194,164,165,7,65,170,96,39,193,187,39,54,193,54,43,230,65,79,192,251,65,48,76,30,194,98,74,184,63,113,236,22,194,72,63,244,193,118,224,9,194,171,62,49,193,86,223,49,66,156,4,112,194,64,228,51,194,121,88,11,194,221,245,26,66,43,54,36,66,35,190,253,192,36,57,160,65,101,217,148,66,101,153,90,66,2,154,163,66,240,135,5,67,246,40,175,192,82,231,9,66,192,123,151,66,222,113,82,66,220,6,118,194,254,67,153,194,8,253,60,194,7,95,46,194,31,128,23,193,36,37,85,63,57,180,56,193,89,23,51,194,171,207,94,193,222,142,84,192,43,135,198,65,79,64,175,65,140,185,53,64,116,53,52,194,170,130,19,194,138,31,108,193,245,219,63,193,254,14,12,193,8,160,15,193,100,204,96,193,27,13,29,66,23,55,67,66,249,15,102,193,225,122,153,192,154,8,253,65,52,17,0,66,157,186,176,64,165,174,159,194,99,110,193,193,187,39,124,193,186,73,126,65,154,119,39,65,112,159,47,194,115,232,163,193,208,132,161,66,113,172,217,64,197,160,178,65,8,253,138,194,128,43,165,192,21,140,67,66,110,163,128,64,247,204,66,192,230,63,251,65,248,194,160,193,236,128,92,194,110,136,1,63,72,225,166,65,60,78,113,65,123,131,79,193,234,4,21,66,165,206,144,65,138,78,76,66,116,164,145,65,122,199,158,65,39,241,53,194,177,97,53,194,94,75,135,192,167,232,125,193,185,83,194,192,22,135,255,191,236,18,20,193,174,24,52,66,104,147,140,66,41,203,49,194,244,108,40,64,83,232,132,64,183,162,76,194,157,17,222,193,50,102,158,65,166,15,30,193,102,166,125,66,230,63,65,66,174,13,15,193,57,180,87,193,63,215,51,194,35,91,83,66,203,16,138,193,249,20,204,191,164,112,185,65,71,61,64,192,227,165,4,66,214,86,252,65,84,227,232,65,43,118,207,65,100,187,227,193,34,253,42,193,52,130,177,66,218,85,120,192,110,180,140,65,211,188,91,65,89,134,42,193,72,196,237,64,92,143,167,193,91,49,141,193,6,129,52,193,54,205,44,193,9,121,14,194,117,229,220,192,26,105,123,64,137,193,215,65,238,235,56,64,9,138,160,64,156,22,114,192,14,173,153,193,167,232,40,193,93,126,135,194,133,252,162,65,127,106,236,65,93,62,87,66,127,89,7,194,18,148,222,193,214,115,247,192,5,197,250,193,219,138,188,193,59,129,27,194,169,36,142,193,223,79,55,65,131,175,227,65,106,205,74,66,139,253,153,193,220,104,50,194,86,31,113,194,102,102,97,66,55,9,174,65,159,147,167,64,135,80,245,64,100,175,115,192,236,145,28,194,221,164,230,65,65,241,69,192,123,3,43,194,65,113,201,193,11,6,53,66,93,254,230,65,9,74,112,66,8,236,128,66,25,197,96,64,98,16,223,193,86,43,26,193,155,102,220,65,172,28,119,65,183,40,139,192,226,233,237,191,14,161,162,63,126,140,120,193,121,105,184,65,252,24,119,193,43,53,1,192,244,55,198,192,209,34,88,193,254,55,6,65,211,19,206,191,171,143,1,194,242,210,34,65,119,45,249,63,41,237,67,65,45,9,68,192,16,245,24,193,59,223,101,65,67,144,239,191,31,244,156,65,124,39,114,192,195,245,147,193,252,24,86,193,116,36,191,193,250,254,162,193,42,29,220,192,220,232,139,193,72,225,119,65,223,79,107,65,179,235,142,189,203,16,124,65,125,174,73,65,202,166,76,192,176,172,25,65,253,19,146,192,234,149,34,65,77,243,120,65,59,141,220,64,74,123,252,193,0,0,57,193,150,178,184,193,75,170,11,66,25,226,68,65,138,147,245,64,84,169,161,191,67,28,35,64,185,194,121,192,213,231,152,193,132,158,243,64,71,3,248,193,73,157,71,65,184,117,47,64,49,153,70,65,214,5,30,194,140,105,166,190,75,89,183,193,28,124,228,193,185,165,201,64,15,11,119,65,181,55,40,192,75,72,161,193,118,84,167,64,136,133,69,193,86,101,221,192,104,17,133,65,44,72,211,191,203,190,63,64,77,149,191,193,142,64,184,191,79,64,102,193,4,86,251,193,227,199,33,65,220,157,217,63,30,150,172,193,80,141,151,64,152,250,213,191,195,71,199,64,204,127,91,193,177,191,168,65,49,20,27,193,168,53,41,193,46,197,9,64,39,194,169,65,11,70,80,193,122,54,183,191,151,16,151,65,147,169,42,65,196,66,94,65,29,218,218,65,211,23,242,62,224,243,236,192,145,237,109,193,90,245,205,65,76,55,227,65,128,130,3,192,226,59,21,193,3,137,138,193,186,73,122,65,180,2,223,64,217,206,125,193,29,201,142,193,241,99,199,193,28,235,72,65,2,159,229,64,254,175,132,60,235,197,191,64,89,23,36,194,203,156,250,63,190,246,216,192,214,57,19,65,229,242,147,64,227,194,202,192,190,188,243,192,186,218,221,65,14,190,14,193,240,22,99,193,50,61,252,64,134,201,67,193,195,245,169,193,204,238,37,192,13,113,92,65,97,84,50,192,191,14,196,193,51,51,185,65,107,253,30,193,222,60,59,192,3,96,120,64,103,68,52,65,97,50,51,65,56,202,26,65,149,212,22,193,45,67,200,64,17,71,18,66,18,189,56,64,205,6,233,63,246,40,118,65,188,121,56,192,156,179,158,65,119,45,104,193,68,134,189,64,58,175,35,192,233,183,167,193,237,187,112,64,40,15,148,65,13,224,88,193,169,246,250,192,10,215,159,193,91,211,196,65,121,233,135,65,48,76,153,193,28,124,173,63,213,237,71,188,105,55,42,62,95,210,31,65,112,177,220,192,188,22,164,193,223,21,57,192,60,107,37,64,90,100,136,193,126,215,18,193,103,196,189,193,165,189,73,65,138,31,146,193,235,86,11,64,78,98,81,193,111,187,27,193,140,74,68,193,122,228,217,64,116,198,162,65,193,168,36,193,217,66,155,64,189,53,166,192,232,246,216,64,70,20,144,65,27,13,102,65,174,159,254,189,193,57,32,193,130,86,150,192,132,216,214,64,200,24,153,193,149,43,3,65,138,48,187,65,60,78,37,193,146,203,131,63,137,94,148,192,140,219,175,65,11,36,56,65,144,177,247,193,77,21,165,193,45,33,5,194,153,187,251,65,60,189,55,193,251,58,56,65,196,37,175,191,198,34,23,65,34,44,22,194,97,113,74,192,253,19,6,192,188,34,40,192,183,226,33,66,247,53,4,194,54,188,12,193,69,71,120,193,101,170,124,193,124,10,255,64,77,4,21,66,64,211,34,66,27,158,107,193,176,3,75,193,124,242,26,64,48,76,36,193,245,57,207,65,215,163,109,65,172,173,183,65,173,250,132,193,63,145,105,192,132,42,142,64,27,30,179,193,24,38,91,65,231,251,45,193,212,14,134,64,195,211,193,193,24,207,104,192,215,52,114,193,86,206,35,66,22,234,225,65,178,29,10,193,57,180,72,193,39,160,230,65,159,230,124,191,210,111,159,192,33,159,200,193,128,158,246,190,132,187,87,192,240,162,177,64,57,98,30,193,113,56,1,193,100,221,186,65,167,179,71,64,188,34,10,193,53,99,33,63,214,197,145,193,65,130,177,193,80,205,51,66,21,157,158,65,5,180,189,65,193,74,9,65,31,191,249,64,224,219,228,63,17,25,2,193,169,19,8,192,156,22,228,192,87,108,200,193,97,212,133,193,211,159,6,65,242,65,1,64,46,16,154,65,57,197,160,65,98,190,191,64,223,224,224,65,206,194,190,64,14,50,27,64,14,161,202,192,184,175,212,193,183,226,190,193,237,83,4,65,23,183,67,64,223,20,123,60,203,104,228,62,209,174,157,192,182,4,152,65,118,224,181,65,187,184,120,65,75,171,236,192,215,35,33,66,96,118,45,65,106,94,206,65,150,248,12,193,0,0,88,193,150,4,186,64,125,208,51,65,59,1,222,64,6,228,22,193,21,58,24,65,103,196,183,65,89,209,18,193,145,254,131,193,127,222,200,191,118,79,58,192,230,121,133,64,202,195,46,65,2,154,32,65,145,254,219,193,153,13,4,193,31,133,219,191,206,25,56,193,213,120,39,193,66,79,189,65,63,87,93,193,135,167,107,65,248,13,0,65,252,0,46,192,205,233,12,193,217,206,216,65,132,100,27,64,192,91,55,65,248,66,193,193,186,235,167,193,43,193,144,64,182,115,134,65,233,166,154,65,77,243,49,65,244,108,85,65,105,111,82,193,65,14,106,63,24,21,202,193,63,140,193,64,190,48,67,65,99,127,175,65,111,18,110,65,181,224,221,64,181,137,159,191,114,254,254,192,79,64,131,65,64,77,23,192,63,70,207,193,13,96,56,66,230,17,13,65,56,103,198,65,246,40,55,65,14,45,84,193,84,244,158,193,155,213,227,193,123,20,117,65,55,137,72,193,34,108,193,65,122,54,40,65,146,203,177,65,26,233,30,65,183,98,150,193,137,193,27,66,59,129,160,193,237,158,13,194,20,208,242,64,130,112,25,191,67,28,145,193,75,89,25,65,0,128,139,65,188,116,168,193,73,157,2,65,55,253,201,64,196,49,118,194,172,98,11,193,105,0,158,65,90,228,201,193,118,50,100,64,90,42,211,191,241,227,215,193,46,0,149,62,9,138,72,193,123,20,40,193,127,251,48,65,46,231,154,64,160,109,33,191,65,183,119,192,14,50,53,191,240,22,82,193,8,61,157,193,229,242,129,193,216,216,155,64,192,9,189,192,187,15,94,64,174,88,32,194,40,254,134,65,50,85,37,65,196,66,129,191,59,223,129,65,199,160,243,190,18,20,227,65,254,154,224,63,30,22,226,65,205,204,76,63,102,102,102,63,1,0,0,0,88,196,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0,240,211,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,3,0,0,0,248,211,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,200,196,0,0,99,50,45,62,98,112,102,95,98,117,102,32,33,61,32,78,85,76,76,0,46,46,47,115,114,99,47,99,111,100,101,99,50,46,99,0,99,111,100,101,99,50,95,99,114,101,97,116,101,0,99,50,32,33,61,32,78,85,76,76,0,99,111,100,101,99,50,95,100,101,115,116,114,111,121,0,40,99,50,45,62,109,111,100,101,32,61,61,32,67,79,68,69,67,50,95,77,79,68,69,95,51,50,48,48,41,32,124,124,32,40,99,50,45,62,109,111,100,101,32,61,61,32,67,79,68,69,67,50,95,77,79,68,69,95,50,52,48,48,41,32,124,124,32,40,99,50,45,62,109,111,100,101,32,61,61,32,67,79,68,69,67,50,95,77,79,68,69,95,49,54,48,48,41,32,124,124,32,40,99,50,45,62,109,111,100,101,32,61,61,32,67,79,68,69,67,50,95,77,79,68,69,95,49,52,48,48,41,32,124,124,32,40,99,50,45,62,109,111,100,101,32,61,61,32,67,79,68,69,67,50,95,77,79,68,69,95,49,51,48,48,41,32,124,124,32,40,99,50,45,62,109,111,100,101,32,61,61,32,67,79,68,69,67,50,95,77,79,68,69,95,49,50,48,48,41,32,124,124,32,40,99,50,45,62,109,111,100,101,32,61,61,32,67,79,68,69,67,50,95,77,79,68,69,95,55,48,48,41,32,124,124,32,40,99,50,45,62,109,111,100,101,32,61,61,32,67,79,68,69,67,50,95,77,79,68,69,95,55,48,48,66,41,0,99,111,100,101,99,50,95,100,101,99,111,100,101,95,98,101,114,0,99,111,100,101,99,50,95,100,101,99,111,100,101,95,51,50,48,48,0,99,111,100,101,99,50,95,100,101,99,111,100,101,95,50,52,48,48,0,99,111,100,101,99,50,95,100,101,99,111,100,101,95,49,54,48,48,0,99,111,100,101,99,50,95,100,101,99,111,100,101,95,49,52,48,48,0,99,111,100,101,99,50,95,100,101,99,111,100,101,95,49,51,48,48,0,115,111,102,116,32,109,117,116,101,10,0,99,111,100,101,99,50,95,100,101,99,111,100,101,95,49,50,48,48,0,99,111,100,101,99,50,95,100,101,99,111,100,101,95,55,48,48,0,99,111,100,101,99,50,95,100,101,99,111,100,101,95,55,48,48,98,0,82,101,97,108,32,70,70,84,32,111,112,116,105,109,105,122,97,116,105,111,110,32,109,117,115,116,32,98,101,32,101,118,101,110,46,10,0,115,116,45,62,115,117,98,115,116,97,116,101,45,62,105,110,118,101,114,115,101,61,61,48,0,46,46,47,115,114,99,47,107,105,115,115,95,102,102,116,114,46,99,0,107,105,115,115,95,102,102,116,114,0,115,116,45,62,115,117,98,115,116,97,116,101,45,62,105,110,118,101,114,115,101,32,61,61,32,49,0,107,105,115,115,95,102,102,116,114,105,0,101,32,62,32,48,46,48,0,46,46,47,115,114,99,47,112,111,115,116,102,105,108,116,101,114,46,99,0,112,111,115,116,102,105,108,116,101,114,0,109,32,60,61,32,80,77,65,88,95,77,0,46,46,47,115,114,99,47,110,108,112,46,99], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE+40960);
/* memory initializer */ allocate([0,110,108,112,95,99,114,101,97,116,101,0,110,108,112,45,62,102,102,116,95,99,102,103,32,33,61,32,78,85,76,76,0,110,108,112,95,115,116,97,116,101,32,33,61,32,78,85,76,76,0,110,108,112,95,100,101,115,116,114,111,121,0,17,0,10,0,17,17,17,0,0,0,0,5,0,0,0,0,0,0,9,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,15,10,17,17,17,3,10,7,0,1,19,9,11,11,0,0,9,6,11,0,0,11,0,6,17,0,0,0,17,17,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,10,10,17,17,17,0,10,0,0,2,0,9,11,0,0,0,9,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,13,0,0,0,0,9,14,0,0,0,0,0,14,0,0,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,15,0,0,0,0,9,16,0,0,0,0,0,16,0,0,16,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,10,0,0,0,0,9,11,0,0,0,0,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,45,43,32,32,32,48,88,48,120,0,84,33,34,25,13,1,2,3,17,75,28,12,16,4,11,29,18,30,39,104,110,111,112,113,98,32,5,6,15,19,20,21,26,8,22,7,40,36,23,24,9,10,14,27,31,37,35,131,130,125,38,42,43,60,61,62,63,67,71,74,77,88,89,90,91,92,93,94,95,96,97,99,100,101,102,103,105,106,107,108,114,115,116,121,122,123,124,0,73,108,108,101,103,97,108,32,98,121,116,101,32,115,101,113,117,101,110,99,101,0,68,111,109,97,105,110,32,101,114,114,111,114,0,82,101,115,117,108,116,32,110,111,116,32,114,101,112,114,101,115,101,110,116,97,98,108,101,0,78,111,116,32,97,32,116,116,121,0,80,101,114,109,105,115,115,105,111,110,32,100,101,110,105,101,100,0,79,112,101,114,97,116,105,111,110,32,110,111,116,32,112,101,114,109,105,116,116,101,100,0,78,111,32,115,117,99,104,32,102,105,108,101,32,111,114,32,100,105,114,101,99,116,111,114,121,0,78,111,32,115,117,99,104,32,112,114,111,99,101,115,115,0,70,105,108,101,32,101,120,105,115,116,115,0,86,97,108,117,101,32,116,111,111,32,108,97,114,103,101,32,102,111,114,32,100,97,116,97,32,116,121,112,101,0,78,111,32,115,112,97,99,101,32,108,101,102,116,32,111,110,32,100,101,118,105,99,101,0,79,117,116,32,111,102,32,109,101,109,111,114,121,0,82,101,115,111,117,114,99,101,32,98,117,115,121,0,73,110,116,101,114,114,117,112,116,101,100,32,115,121,115,116,101,109,32,99,97,108,108,0,82,101,115,111,117,114,99,101,32,116,101,109,112,111,114,97,114,105,108,121,32,117,110,97,118,97,105,108,97,98,108,101,0,73,110,118,97,108,105,100,32,115,101,101,107,0,67,114,111,115,115,45,100,101,118,105,99,101,32,108,105,110,107,0,82,101,97,100,45,111,110,108,121,32,102,105,108,101,32,115,121,115,116,101,109,0,68,105,114,101,99,116,111,114,121,32,110,111,116,32,101,109,112,116,121,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,112,101,101,114,0,79,112,101,114,97,116,105,111,110,32,116,105,109,101,100,32,111,117,116,0,67,111,110,110,101,99,116,105,111,110,32,114,101,102,117,115,101,100,0,72,111,115,116,32,105,115,32,100,111,119,110,0,72,111,115,116,32,105,115,32,117,110,114,101,97,99,104,97,98,108,101,0,65,100,100,114,101,115,115,32,105,110,32,117,115,101,0,66,114,111,107,101,110,32,112,105,112,101,0,73,47,79,32,101,114,114,111,114,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,32,111,114,32,97,100,100,114,101,115,115,0,66,108,111,99,107,32,100,101,118,105,99,101,32,114,101,113,117,105,114,101,100,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,0,78,111,116,32,97,32,100,105,114,101,99,116,111,114,121,0,73,115,32,97,32,100,105,114,101,99,116,111,114,121,0,84,101,120,116,32,102,105,108,101,32,98,117,115,121,0,69,120,101,99,32,102,111,114,109,97,116,32,101,114,114,111,114,0,73,110,118,97,108,105,100,32,97,114,103,117,109,101,110,116,0,65,114,103,117,109,101,110,116,32,108,105,115,116,32,116,111,111,32,108,111,110,103,0,83,121,109,98,111,108,105,99,32,108,105,110,107,32,108,111,111,112,0,70,105,108,101,110,97,109,101,32,116,111,111,32,108,111,110,103,0,84,111,111,32,109,97,110,121,32,111,112,101,110,32,102,105,108,101,115,32,105,110,32,115,121,115,116,101,109,0,78,111,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,115,32,97,118,97,105,108,97,98,108,101,0,66,97,100,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,0,78,111,32,99,104,105,108,100,32,112,114,111,99,101,115,115,0,66,97,100,32,97,100,100,114,101,115,115,0,70,105,108,101,32,116,111,111,32,108,97,114,103,101,0,84,111,111,32,109,97,110,121,32,108,105,110,107,115,0,78,111,32,108,111,99,107,115,32,97,118,97,105,108,97,98,108,101,0,82,101,115,111,117,114,99,101,32,100,101,97,100,108,111,99,107,32,119,111,117,108,100,32,111,99,99,117,114,0,83,116,97,116,101,32,110,111,116,32,114,101,99,111,118,101,114,97,98,108,101,0,80,114,101,118,105,111,117,115,32,111,119,110,101,114,32,100,105,101,100,0,79,112,101,114,97,116,105,111,110,32,99,97,110,99,101,108,101,100,0,70,117,110,99,116,105,111,110,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,78,111,32,109,101,115,115,97,103,101,32,111,102,32,100,101,115,105,114,101,100,32,116,121,112,101,0,73,100,101,110,116,105,102,105,101,114,32,114,101,109,111,118,101,100,0,68,101,118,105,99,101,32,110,111,116,32,97,32,115,116,114,101,97,109,0,78,111,32,100,97,116,97,32,97,118,97,105,108,97,98,108,101,0,68,101,118,105,99,101,32,116,105,109,101,111,117,116,0,79,117,116,32,111,102,32,115,116,114,101,97,109,115,32,114,101,115,111,117,114,99,101,115,0,76,105,110,107,32,104,97,115,32,98,101,101,110,32,115,101,118,101,114,101,100,0,80,114,111,116,111,99,111,108,32,101,114,114,111,114,0,66,97,100,32,109,101,115,115,97,103,101,0,70,105,108,101,32,100,101,115,99,114,105,112,116,111,114,32,105,110,32,98,97,100,32,115,116,97,116,101,0,78,111,116,32,97,32,115,111,99,107,101,116,0,68,101,115,116,105,110,97,116,105,111,110,32,97,100,100,114,101,115,115,32,114,101,113,117,105,114,101,100,0,77,101,115,115,97,103,101,32,116,111,111,32,108,97,114,103,101,0,80,114,111,116,111,99,111,108,32,119,114,111,110,103,32,116,121,112,101,32,102,111,114,32,115,111,99,107,101,116,0,80,114,111,116,111,99,111,108,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,80,114,111,116,111,99,111,108,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,83,111,99,107,101,116,32,116,121,112,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,78,111,116,32,115,117,112,112,111,114,116,101,100,0,80,114,111,116,111,99,111,108,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,65,100,100,114,101,115,115,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,98,121,32,112,114,111,116,111,99,111,108,0,65,100,100,114,101,115,115,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,78,101,116,119,111,114,107,32,105,115,32,100,111,119,110,0,78,101,116,119,111,114,107,32,117,110,114,101,97,99,104,97,98,108,101,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,110,101,116,119,111,114,107,0,67,111,110,110,101,99,116,105,111,110,32,97,98,111,114,116,101,100,0,78,111,32,98,117,102,102,101,114,32,115,112,97,99,101,32,97,118,97,105,108,97,98,108,101,0,83,111,99,107,101,116,32,105,115,32,99,111,110,110,101,99,116,101,100,0,83,111,99,107,101,116,32,110,111,116,32,99,111,110,110,101,99,116,101,100,0,67,97,110,110,111,116,32,115,101,110,100,32,97,102,116,101,114,32,115,111,99,107,101,116,32,115,104,117,116,100,111,119,110,0,79,112,101,114,97,116,105,111,110,32,97,108,114,101,97,100,121,32,105,110,32,112,114,111,103,114,101,115,115,0,79,112,101,114,97,116,105,111,110,32,105,110,32,112,114,111,103,114,101,115,115,0,83,116,97,108,101,32,102,105,108,101,32,104,97,110,100,108,101,0,82,101,109,111,116,101,32,73,47,79,32,101,114,114,111,114,0,81,117,111,116,97,32,101,120,99,101,101,100,101,100,0,78,111,32,109,101,100,105,117,109,32,102,111,117,110,100,0,87,114,111,110,103,32,109,101,100,105,117,109,32,116,121,112,101,0,78,111,32,101,114,114,111,114,32,105,110,102,111,114,109,97,116,105,111,110,0,0,40,110,117,108,108,41,0,45,48,88,43,48,88,32,48,88,45,48,120,43,48,120,32,48,120,0,105,110,102,0,73,78,70,0,110,97,110,0,78,65,78,0,46,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE+51200);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


   
  Module["_i64Subtract"] = _i64Subtract;

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    }
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _sysconf(name) {
      // long sysconf(int name);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/sysconf.html
      switch(name) {
        case 30: return PAGE_SIZE;
        case 85: return totalMemory / PAGE_SIZE;
        case 132:
        case 133:
        case 12:
        case 137:
        case 138:
        case 15:
        case 235:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20:
        case 149:
        case 13:
        case 10:
        case 236:
        case 153:
        case 9:
        case 21:
        case 22:
        case 159:
        case 154:
        case 14:
        case 77:
        case 78:
        case 139:
        case 80:
        case 81:
        case 82:
        case 68:
        case 67:
        case 164:
        case 11:
        case 29:
        case 47:
        case 48:
        case 95:
        case 52:
        case 51:
        case 46:
          return 200809;
        case 79:
          return 0;
        case 27:
        case 246:
        case 127:
        case 128:
        case 23:
        case 24:
        case 160:
        case 161:
        case 181:
        case 182:
        case 242:
        case 183:
        case 184:
        case 243:
        case 244:
        case 245:
        case 165:
        case 178:
        case 179:
        case 49:
        case 50:
        case 168:
        case 169:
        case 175:
        case 170:
        case 171:
        case 172:
        case 97:
        case 76:
        case 32:
        case 173:
        case 35:
          return -1;
        case 176:
        case 177:
        case 7:
        case 155:
        case 8:
        case 157:
        case 125:
        case 126:
        case 92:
        case 93:
        case 129:
        case 130:
        case 131:
        case 94:
        case 91:
          return 1;
        case 74:
        case 60:
        case 69:
        case 70:
        case 4:
          return 1024;
        case 31:
        case 42:
        case 72:
          return 32;
        case 87:
        case 26:
        case 33:
          return 2147483647;
        case 34:
        case 1:
          return 47839;
        case 38:
        case 36:
          return 99;
        case 43:
        case 37:
          return 2048;
        case 0: return 2097152;
        case 3: return 65536;
        case 28: return 32768;
        case 44: return 32767;
        case 75: return 16384;
        case 39: return 1000;
        case 89: return 700;
        case 71: return 256;
        case 40: return 255;
        case 2: return 100;
        case 180: return 64;
        case 25: return 20;
        case 5: return 16;
        case 6: return 6;
        case 73: return 4;
        case 84: {
          if (typeof navigator === 'object') return navigator['hardwareConcurrency'] || 1;
          return 1;
        }
      }
      ___setErrNo(ERRNO_CODES.EINVAL);
      return -1;
    }

   
  Module["_memset"] = _memset;

  function _pthread_cleanup_push(routine, arg) {
      __ATEXIT__.push(function() { Runtime.dynCall('vi', routine, [arg]) })
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

   
  Module["_bitshift64Lshr"] = _bitshift64Lshr;

   
  Module["_bitshift64Shl"] = _bitshift64Shl;

  function _pthread_cleanup_pop() {
      assert(_pthread_cleanup_push.level == __ATEXIT__.length, 'cannot pop if something else added meanwhile!');
      __ATEXIT__.pop();
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

  function _abort() {
      Module['abort']();
    }

  function ___assert_fail(condition, filename, line, func) {
      ABORT = true;
      throw 'Assertion failed: ' + Pointer_stringify(condition) + ', at: ' + [filename ? Pointer_stringify(filename) : 'unknown filename', line, func ? Pointer_stringify(func) : 'unknown function'] + ' at ' + stackTrace();
    }

  function ___lock() {}

  function ___unlock() {}

  function _llvm_stackrestore(p) {
      var self = _llvm_stacksave;
      var ret = self.LLVM_SAVEDSTACKS[p];
      self.LLVM_SAVEDSTACKS.splice(p, 1);
      Runtime.stackRestore(ret);
    }

   
  Module["_i64Add"] = _i64Add;

  function _sbrk(bytes) {
      // Implement a Linux-like 'memory area' for our 'process'.
      // Changes the size of the memory area by |bytes|; returns the
      // address of the previous top ('break') of the memory area
      // We control the "dynamic" memory - DYNAMIC_BASE to DYNAMICTOP
      var self = _sbrk;
      if (!self.called) {
        DYNAMICTOP = alignMemoryPage(DYNAMICTOP); // make sure we start out aligned
        self.called = true;
        assert(Runtime.dynamicAlloc);
        self.alloc = Runtime.dynamicAlloc;
        Runtime.dynamicAlloc = function() { abort('cannot dynamically allocate, sbrk now has control') };
      }
      var ret = DYNAMICTOP;
      if (bytes != 0) {
        var success = self.alloc(bytes);
        if (!success) return -1 >>> 0; // sbrk failure code
      }
      return ret;  // Previous break location.
    }

  function _llvm_stacksave() {
      var self = _llvm_stacksave;
      if (!self.LLVM_SAVEDSTACKS) {
        self.LLVM_SAVEDSTACKS = [];
      }
      self.LLVM_SAVEDSTACKS.push(Runtime.stackSave());
      return self.LLVM_SAVEDSTACKS.length-1;
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 
  Module["_memcpy"] = _memcpy;

  var _llvm_pow_f32=Math_pow;

  var _llvm_fabs_f32=Math_abs;

  function _time(ptr) {
      var ret = (Date.now()/1000)|0;
      if (ptr) {
        HEAP32[((ptr)>>2)]=ret;
      }
      return ret;
    }

  var _llvm_pow_f64=Math_pow;

  function _pthread_self() {
      //FIXME: assumes only a single thread
      return 0;
    }

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      var offset = offset_low;
      assert(offset_high === 0);
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

staticSealed = true; // seal the static portion of memory

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

 var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_DYNAMIC);


function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_vi": nullFunc_vi, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "_pthread_cleanup_pop": _pthread_cleanup_pop, "___lock": ___lock, "_llvm_fabs_f32": _llvm_fabs_f32, "_llvm_pow_f64": _llvm_pow_f64, "_sysconf": _sysconf, "_pthread_self": _pthread_self, "_abort": _abort, "___setErrNo": ___setErrNo, "___syscall6": ___syscall6, "_sbrk": _sbrk, "_time": _time, "_llvm_pow_f32": _llvm_pow_f32, "___syscall146": ___syscall146, "_pthread_cleanup_push": _pthread_cleanup_push, "_emscripten_memcpy_big": _emscripten_memcpy_big, "___syscall54": ___syscall54, "___unlock": ___unlock, "___syscall140": ___syscall140, "_llvm_stackrestore": _llvm_stackrestore, "___assert_fail": ___assert_fail, "_llvm_stacksave": _llvm_stacksave, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "cttz_i8": cttz_i8 };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
  'almost asm';
  
  
  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);


  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var cttz_i8=env.cttz_i8|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntP = 0, tempBigIntS = 0, tempBigIntR = 0.0, tempBigIntI = 0, tempBigIntD = 0, tempValue = 0, tempDouble = 0.0;

  var tempRet0 = 0;
  var tempRet1 = 0;
  var tempRet2 = 0;
  var tempRet3 = 0;
  var tempRet4 = 0;
  var tempRet5 = 0;
  var tempRet6 = 0;
  var tempRet7 = 0;
  var tempRet8 = 0;
  var tempRet9 = 0;
  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_vi=env.nullFunc_vi;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_vi=env.invoke_vi;
  var _pthread_cleanup_pop=env._pthread_cleanup_pop;
  var ___lock=env.___lock;
  var _llvm_fabs_f32=env._llvm_fabs_f32;
  var _llvm_pow_f64=env._llvm_pow_f64;
  var _sysconf=env._sysconf;
  var _pthread_self=env._pthread_self;
  var _abort=env._abort;
  var ___setErrNo=env.___setErrNo;
  var ___syscall6=env.___syscall6;
  var _sbrk=env._sbrk;
  var _time=env._time;
  var _llvm_pow_f32=env._llvm_pow_f32;
  var ___syscall146=env.___syscall146;
  var _pthread_cleanup_push=env._pthread_cleanup_push;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var ___syscall54=env.___syscall54;
  var ___unlock=env.___unlock;
  var ___syscall140=env.___syscall140;
  var _llvm_stackrestore=env._llvm_stackrestore;
  var ___assert_fail=env.___assert_fail;
  var _llvm_stacksave=env._llvm_stacksave;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
if ((STACKTOP|0) >= (STACK_MAX|0)) abort();

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}
function copyTempFloat(ptr) {
  ptr = ptr|0;
  HEAP8[tempDoublePtr>>0] = HEAP8[ptr>>0];
  HEAP8[tempDoublePtr+1>>0] = HEAP8[ptr+1>>0];
  HEAP8[tempDoublePtr+2>>0] = HEAP8[ptr+2>>0];
  HEAP8[tempDoublePtr+3>>0] = HEAP8[ptr+3>>0];
}
function copyTempDouble(ptr) {
  ptr = ptr|0;
  HEAP8[tempDoublePtr>>0] = HEAP8[ptr>>0];
  HEAP8[tempDoublePtr+1>>0] = HEAP8[ptr+1>>0];
  HEAP8[tempDoublePtr+2>>0] = HEAP8[ptr+2>>0];
  HEAP8[tempDoublePtr+3>>0] = HEAP8[ptr+3>>0];
  HEAP8[tempDoublePtr+4>>0] = HEAP8[ptr+4>>0];
  HEAP8[tempDoublePtr+5>>0] = HEAP8[ptr+5>>0];
  HEAP8[tempDoublePtr+6>>0] = HEAP8[ptr+6>>0];
  HEAP8[tempDoublePtr+7>>0] = HEAP8[ptr+7>>0];
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function _codec2_create($mode) {
 $mode = $mode|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0.0, $82 = 0.0;
 var $83 = 0.0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0.0, $95 = 0.0, $96 = 0.0, $97 = 0.0, $98 = 0, $99 = 0, $c2 = 0, $i = 0;
 var $l = 0, $or$cond = 0, $or$cond11 = 0, $or$cond13 = 0, $or$cond3 = 0, $or$cond5 = 0, $or$cond7 = 0, $or$cond9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $mode;
 $2 = $1;
 $3 = ($2|0)!=(0);
 $4 = $1;
 $5 = ($4|0)!=(1);
 $or$cond = $3 & $5;
 $6 = $1;
 $7 = ($6|0)!=(2);
 $or$cond3 = $or$cond & $7;
 $8 = $1;
 $9 = ($8|0)!=(3);
 $or$cond5 = $or$cond3 & $9;
 $10 = $1;
 $11 = ($10|0)!=(4);
 $or$cond7 = $or$cond5 & $11;
 $12 = $1;
 $13 = ($12|0)!=(5);
 $or$cond9 = $or$cond7 & $13;
 $14 = $1;
 $15 = ($14|0)!=(6);
 $or$cond11 = $or$cond9 & $15;
 $16 = $1;
 $17 = ($16|0)!=(7);
 $or$cond13 = $or$cond11 & $17;
 if ($or$cond13) {
  $0 = 0;
  $157 = $0;
  STACKTOP = sp;return ($157|0);
 }
 $18 = (_malloc(8728)|0);
 $c2 = $18;
 $19 = $c2;
 $20 = ($19|0)==(0|0);
 if ($20) {
  $0 = 0;
  $157 = $0;
  STACKTOP = sp;return ($157|0);
 }
 $21 = $1;
 $22 = $c2;
 HEAP32[$22>>2] = $21;
 $i = 0;
 while(1) {
  $23 = $i;
  $24 = ($23|0)<(320);
  if (!($24)) {
   break;
  }
  $25 = $i;
  $26 = $c2;
  $27 = ((($26)) + 6032|0);
  $28 = (($27) + ($25<<2)|0);
  HEAPF32[$28>>2] = 1.0;
  $29 = $i;
  $30 = (($29) + 1)|0;
  $i = $30;
 }
 $31 = $c2;
 $32 = ((($31)) + 7312|0);
 $33 = ((($32)) + 4|0);
 HEAPF32[$33>>2] = 0.0;
 $34 = $c2;
 $35 = ((($34)) + 7312|0);
 HEAPF32[$35>>2] = 0.0;
 $i = 0;
 while(1) {
  $36 = $i;
  $37 = ($36|0)<(160);
  if (!($37)) {
   break;
  }
  $38 = $i;
  $39 = $c2;
  $40 = ((($39)) + 7332|0);
  $41 = (($40) + ($38<<2)|0);
  HEAPF32[$41>>2] = 0.0;
  $42 = $i;
  $43 = (($42) + 1)|0;
  $i = $43;
 }
 $44 = (_codec2_fft_alloc(512,0,0,0)|0);
 $45 = $c2;
 $46 = ((($45)) + 4|0);
 HEAP32[$46>>2] = $44;
 $47 = (_codec2_fftr_alloc(512,0,0,0)|0);
 $48 = $c2;
 $49 = ((($48)) + 8|0);
 HEAP32[$49>>2] = $47;
 $50 = $c2;
 $51 = ((($50)) + 4|0);
 $52 = HEAP32[$51>>2]|0;
 $53 = $c2;
 $54 = ((($53)) + 12|0);
 $55 = $c2;
 $56 = ((($55)) + 1292|0);
 _make_analysis_window($52,$54,$56);
 $57 = $c2;
 $58 = ((($57)) + 5388|0);
 _make_synthesis_window($58);
 $59 = (_codec2_fftr_alloc(512,1,0,0)|0);
 $60 = $c2;
 $61 = ((($60)) + 7328|0);
 HEAP32[$61>>2] = $59;
 _quantise_init();
 $62 = $c2;
 $63 = ((($62)) + 7980|0);
 HEAPF32[$63>>2] = 0.0;
 $64 = $c2;
 $65 = ((($64)) + 7976|0);
 HEAPF32[$65>>2] = 0.0;
 $66 = $c2;
 $67 = ((($66)) + 7972|0);
 HEAPF32[$67>>2] = 0.0;
 $l = 1;
 while(1) {
  $68 = $l;
  $69 = ($68|0)<=(80);
  if (!($69)) {
   break;
  }
  $70 = $l;
  $71 = $c2;
  $72 = ((($71)) + 7984|0);
  $73 = ((($72)) + 8|0);
  $74 = (($73) + ($70<<2)|0);
  HEAPF32[$74>>2] = 0.0;
  $75 = $l;
  $76 = (($75) + 1)|0;
  $l = $76;
 }
 $77 = $c2;
 $78 = ((($77)) + 7984|0);
 HEAPF32[$78>>2] = 0.039269909262657166;
 $79 = $c2;
 $80 = ((($79)) + 7984|0);
 $81 = +HEAPF32[$80>>2];
 $82 = $81;
 $83 = 3.1415926540000001 / $82;
 $84 = (~~(($83)));
 $85 = $c2;
 $86 = ((($85)) + 7984|0);
 $87 = ((($86)) + 4|0);
 HEAP32[$87>>2] = $84;
 $88 = $c2;
 $89 = ((($88)) + 7984|0);
 $90 = ((($89)) + 656|0);
 HEAP32[$90>>2] = 0;
 $i = 0;
 while(1) {
  $91 = $i;
  $92 = ($91|0)<(10);
  if (!($92)) {
   break;
  }
  $93 = $i;
  $94 = (+($93|0));
  $95 = $94 * 3.1415926540000001;
  $96 = $95 / 11.0;
  $97 = $96;
  $98 = $i;
  $99 = $c2;
  $100 = ((($99)) + 8644|0);
  $101 = (($100) + ($98<<2)|0);
  HEAPF32[$101>>2] = $97;
  $102 = $i;
  $103 = (($102) + 1)|0;
  $i = $103;
 }
 $104 = $c2;
 $105 = ((($104)) + 8684|0);
 HEAPF32[$105>>2] = 1.0;
 $106 = (_nlp_create(320)|0);
 $107 = $c2;
 $108 = ((($107)) + 7320|0);
 HEAP32[$108>>2] = $106;
 $109 = $c2;
 $110 = ((($109)) + 7320|0);
 $111 = HEAP32[$110>>2]|0;
 $112 = ($111|0)==(0|0);
 if ($112) {
  $113 = $c2;
  _free($113);
  $0 = 0;
  $157 = $0;
  STACKTOP = sp;return ($157|0);
 }
 $114 = $1;
 $115 = ($114|0)==(7);
 $116 = $c2;
 $117 = ((($116)) + 7324|0);
 if ($115) {
  HEAP32[$117>>2] = 0;
 } else {
  HEAP32[$117>>2] = 1;
 }
 $118 = $c2;
 $119 = ((($118)) + 8688|0);
 HEAP32[$119>>2] = 1;
 $120 = $c2;
 $121 = ((($120)) + 8692|0);
 HEAP32[$121>>2] = 1;
 $122 = $c2;
 $123 = ((($122)) + 8696|0);
 HEAPF32[$123>>2] = 0.20000000298023224;
 $124 = $c2;
 $125 = ((($124)) + 8700|0);
 HEAPF32[$125>>2] = 0.5;
 $126 = $c2;
 $127 = ((($126)) + 8704|0);
 $128 = ((($127)) + 4|0);
 HEAPF32[$128>>2] = 0.0;
 $129 = $c2;
 $130 = ((($129)) + 8704|0);
 HEAPF32[$130>>2] = 0.0;
 $131 = $c2;
 $132 = ((($131)) + 8712|0);
 $133 = ((($132)) + 4|0);
 HEAPF32[$133>>2] = 0.0;
 $134 = $c2;
 $135 = ((($134)) + 8712|0);
 HEAPF32[$135>>2] = 0.0;
 $136 = $c2;
 $137 = ((($136)) + 8720|0);
 HEAP32[$137>>2] = 0;
 $138 = (_malloc(1684)|0);
 $139 = $c2;
 $140 = ((($139)) + 6028|0);
 HEAP32[$140>>2] = $138;
 $141 = $c2;
 $142 = ((($141)) + 6028|0);
 $143 = HEAP32[$142>>2]|0;
 $144 = ($143|0)!=(0|0);
 if (!($144)) {
  ___assert_fail((50492|0),(50512|0),166,(50528|0));
  // unreachable;
 }
 $i = 0;
 while(1) {
  $145 = $i;
  $146 = ($145|0)<(421);
  if (!($146)) {
   break;
  }
  $147 = $i;
  $148 = $c2;
  $149 = ((($148)) + 6028|0);
  $150 = HEAP32[$149>>2]|0;
  $151 = (($150) + ($147<<2)|0);
  HEAPF32[$151>>2] = 0.0;
  $152 = $i;
  $153 = (($152) + 1)|0;
  $i = $153;
 }
 $154 = $c2;
 $155 = ((($154)) + 8724|0);
 HEAP32[$155>>2] = 0;
 $156 = $c2;
 $0 = $156;
 $157 = $0;
 STACKTOP = sp;return ($157|0);
}
function _codec2_destroy($c2) {
 $c2 = $c2|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $c2;
 $1 = $0;
 $2 = ($1|0)!=(0|0);
 if ($2) {
  $3 = $0;
  $4 = ((($3)) + 6028|0);
  $5 = HEAP32[$4>>2]|0;
  _free($5);
  $6 = $0;
  $7 = ((($6)) + 7320|0);
  $8 = HEAP32[$7>>2]|0;
  _nlp_destroy($8);
  $9 = $0;
  $10 = ((($9)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  _codec2_fft_free($11);
  $12 = $0;
  $13 = ((($12)) + 8|0);
  $14 = HEAP32[$13>>2]|0;
  _codec2_fftr_free($14);
  $15 = $0;
  $16 = ((($15)) + 7328|0);
  $17 = HEAP32[$16>>2]|0;
  _codec2_fftr_free($17);
  $18 = $0;
  _free($18);
  STACKTOP = sp;return;
 } else {
  ___assert_fail((50542|0),(50512|0),187,(50553|0));
  // unreachable;
 }
}
function _codec2_bits_per_frame($c2) {
 $c2 = $c2|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $c2;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)==(0);
 do {
  if ($4) {
   $0 = 64;
  } else {
   $5 = $1;
   $6 = HEAP32[$5>>2]|0;
   $7 = ($6|0)==(1);
   if ($7) {
    $0 = 48;
    break;
   }
   $8 = $1;
   $9 = HEAP32[$8>>2]|0;
   $10 = ($9|0)==(2);
   if ($10) {
    $0 = 64;
    break;
   }
   $11 = $1;
   $12 = HEAP32[$11>>2]|0;
   $13 = ($12|0)==(3);
   if ($13) {
    $0 = 56;
    break;
   }
   $14 = $1;
   $15 = HEAP32[$14>>2]|0;
   $16 = ($15|0)==(4);
   if ($16) {
    $0 = 52;
    break;
   }
   $17 = $1;
   $18 = HEAP32[$17>>2]|0;
   $19 = ($18|0)==(5);
   if ($19) {
    $0 = 48;
    break;
   }
   $20 = $1;
   $21 = HEAP32[$20>>2]|0;
   $22 = ($21|0)==(6);
   if ($22) {
    $0 = 28;
    break;
   }
   $23 = $1;
   $24 = HEAP32[$23>>2]|0;
   $25 = ($24|0)==(7);
   if ($25) {
    $0 = 28;
    break;
   } else {
    $0 = 0;
    break;
   }
  }
 } while(0);
 $26 = $0;
 STACKTOP = sp;return ($26|0);
}
function _codec2_samples_per_frame($c2) {
 $c2 = $c2|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $c2;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)==(0);
 do {
  if ($4) {
   $0 = 160;
  } else {
   $5 = $1;
   $6 = HEAP32[$5>>2]|0;
   $7 = ($6|0)==(1);
   if ($7) {
    $0 = 160;
    break;
   }
   $8 = $1;
   $9 = HEAP32[$8>>2]|0;
   $10 = ($9|0)==(2);
   if ($10) {
    $0 = 320;
    break;
   }
   $11 = $1;
   $12 = HEAP32[$11>>2]|0;
   $13 = ($12|0)==(3);
   if ($13) {
    $0 = 320;
    break;
   }
   $14 = $1;
   $15 = HEAP32[$14>>2]|0;
   $16 = ($15|0)==(4);
   if ($16) {
    $0 = 320;
    break;
   }
   $17 = $1;
   $18 = HEAP32[$17>>2]|0;
   $19 = ($18|0)==(5);
   if ($19) {
    $0 = 320;
    break;
   }
   $20 = $1;
   $21 = HEAP32[$20>>2]|0;
   $22 = ($21|0)==(6);
   if ($22) {
    $0 = 320;
    break;
   }
   $23 = $1;
   $24 = HEAP32[$23>>2]|0;
   $25 = ($24|0)==(7);
   if ($25) {
    $0 = 320;
    break;
   } else {
    $0 = 0;
    break;
   }
  }
 } while(0);
 $26 = $0;
 STACKTOP = sp;return ($26|0);
}
function _codec2_decode($c2,$speech,$bits) {
 $c2 = $c2|0;
 $speech = $speech|0;
 $bits = $bits|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $c2;
 $1 = $speech;
 $2 = $bits;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 _codec2_decode_ber($3,$4,$5,0.0);
 STACKTOP = sp;return;
}
function _codec2_decode_ber($c2,$speech,$bits,$ber_est) {
 $c2 = $c2|0;
 $speech = $speech|0;
 $bits = $bits|0;
 $ber_est = +$ber_est;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0.0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0.0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $c2;
 $1 = $speech;
 $2 = $bits;
 $3 = $ber_est;
 $4 = $0;
 $5 = ($4|0)!=(0|0);
 if (!($5)) {
  ___assert_fail((50542|0),(50512|0),300,(50836|0));
  // unreachable;
 }
 $6 = $0;
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==(0);
 if (!($8)) {
  $9 = $0;
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)==(1);
  if (!($11)) {
   $12 = $0;
   $13 = HEAP32[$12>>2]|0;
   $14 = ($13|0)==(2);
   if (!($14)) {
    $15 = $0;
    $16 = HEAP32[$15>>2]|0;
    $17 = ($16|0)==(3);
    if (!($17)) {
     $18 = $0;
     $19 = HEAP32[$18>>2]|0;
     $20 = ($19|0)==(4);
     if (!($20)) {
      $21 = $0;
      $22 = HEAP32[$21>>2]|0;
      $23 = ($22|0)==(5);
      if (!($23)) {
       $24 = $0;
       $25 = HEAP32[$24>>2]|0;
       $26 = ($25|0)==(6);
       if (!($26)) {
        $27 = $0;
        $28 = HEAP32[$27>>2]|0;
        $29 = ($28|0)==(7);
        if (!($29)) {
         ___assert_fail((50568|0),(50512|0),310,(50836|0));
         // unreachable;
        }
       }
      }
     }
    }
   }
  }
 }
 $30 = $0;
 $31 = HEAP32[$30>>2]|0;
 $32 = ($31|0)==(0);
 if ($32) {
  $33 = $0;
  $34 = $1;
  $35 = $2;
  _codec2_decode_3200($33,$34,$35);
 }
 $36 = $0;
 $37 = HEAP32[$36>>2]|0;
 $38 = ($37|0)==(1);
 if ($38) {
  $39 = $0;
  $40 = $1;
  $41 = $2;
  _codec2_decode_2400($39,$40,$41);
 }
 $42 = $0;
 $43 = HEAP32[$42>>2]|0;
 $44 = ($43|0)==(2);
 if ($44) {
  $45 = $0;
  $46 = $1;
  $47 = $2;
  _codec2_decode_1600($45,$46,$47);
 }
 $48 = $0;
 $49 = HEAP32[$48>>2]|0;
 $50 = ($49|0)==(3);
 if ($50) {
  $51 = $0;
  $52 = $1;
  $53 = $2;
  _codec2_decode_1400($51,$52,$53);
 }
 $54 = $0;
 $55 = HEAP32[$54>>2]|0;
 $56 = ($55|0)==(4);
 if ($56) {
  $57 = $0;
  $58 = $1;
  $59 = $2;
  $60 = $3;
  _codec2_decode_1300($57,$58,$59,$60);
 }
 $61 = $0;
 $62 = HEAP32[$61>>2]|0;
 $63 = ($62|0)==(5);
 if ($63) {
  $64 = $0;
  $65 = $1;
  $66 = $2;
  _codec2_decode_1200($64,$65,$66);
 }
 $67 = $0;
 $68 = HEAP32[$67>>2]|0;
 $69 = ($68|0)==(6);
 if ($69) {
  $70 = $0;
  $71 = $1;
  $72 = $2;
  _codec2_decode_700($70,$71,$72);
 }
 $73 = $0;
 $74 = HEAP32[$73>>2]|0;
 $75 = ($74|0)==(7);
 if (!($75)) {
  STACKTOP = sp;return;
 }
 $76 = $0;
 $77 = $1;
 $78 = $2;
 _codec2_decode_700b($76,$77,$78);
 STACKTOP = sp;return;
}
function _codec2_decode_3200($c2,$speech,$bits) {
 $c2 = $c2|0;
 $speech = $speech|0;
 $bits = $bits|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0.0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0.0, $29 = 0, $3 = 0, $30 = 0, $31 = 0.0, $32 = 0.0, $33 = 0.0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0.0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0.0, $59 = 0, $6 = 0;
 var $60 = 0.0, $61 = 0.0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0;
 var $79 = 0, $8 = 0, $80 = 0.0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0.0, $9 = 0, $90 = 0, $91 = 0, $92 = 0.0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 var $97 = 0, $98 = 0, $99 = 0, $Aw = 0, $Wo_index = 0, $ak = 0, $e = 0, $e_index = 0, $i = 0, $j = 0, $lspd_indexes = 0, $lsps = 0, $model = 0, $nbit = 0, $snr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 5680|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $model = sp + 4344|0;
 $lspd_indexes = sp + 4304|0;
 $lsps = sp + 4224|0;
 $e = sp + 4208|0;
 $snr = sp + 4200|0;
 $ak = sp + 4112|0;
 $nbit = sp + 4096|0;
 $Aw = sp;
 $0 = $c2;
 $1 = $speech;
 $2 = $bits;
 HEAP32[$nbit>>2] = 0;
 $3 = $0;
 $4 = ($3|0)!=(0|0);
 if (!($4)) {
  ___assert_fail((50542|0),(50512|0),421,(50854|0));
  // unreachable;
 }
 $i = 0;
 while(1) {
  $5 = $i;
  $6 = ($5|0)<(2);
  if (!($6)) {
   break;
  }
  $j = 1;
  while(1) {
   $7 = $j;
   $8 = ($7|0)<=(80);
   if (!($8)) {
    break;
   }
   $9 = $j;
   $10 = $i;
   $11 = (($model) + (($10*660)|0)|0);
   $12 = ((($11)) + 8|0);
   $13 = (($12) + ($9<<2)|0);
   HEAPF32[$13>>2] = 0.0;
   $14 = $j;
   $15 = (($14) + 1)|0;
   $j = $15;
  }
  $16 = $i;
  $17 = (($16) + 1)|0;
  $i = $17;
 }
 $18 = $2;
 $19 = (_unpack($18,$nbit,1)|0);
 $20 = ((($model)) + 656|0);
 HEAP32[$20>>2] = $19;
 $21 = $2;
 $22 = (_unpack($21,$nbit,1)|0);
 $23 = ((($model)) + 660|0);
 $24 = ((($23)) + 656|0);
 HEAP32[$24>>2] = $22;
 $25 = $2;
 $26 = (_unpack($25,$nbit,7)|0);
 $Wo_index = $26;
 $27 = $Wo_index;
 $28 = (+_decode_Wo($27,7));
 $29 = ((($model)) + 660|0);
 HEAPF32[$29>>2] = $28;
 $30 = ((($model)) + 660|0);
 $31 = +HEAPF32[$30>>2];
 $32 = $31;
 $33 = 3.1415926540000001 / $32;
 $34 = (~~(($33)));
 $35 = ((($model)) + 660|0);
 $36 = ((($35)) + 4|0);
 HEAP32[$36>>2] = $34;
 $37 = $2;
 $38 = (_unpack($37,$nbit,5)|0);
 $e_index = $38;
 $39 = $e_index;
 $40 = (+_decode_energy($39,5));
 $41 = ((($e)) + 4|0);
 HEAPF32[$41>>2] = $40;
 $i = 0;
 while(1) {
  $42 = $i;
  $43 = ($42|0)<(10);
  if (!($43)) {
   break;
  }
  $44 = $2;
  $45 = $i;
  $46 = (_lspd_bits($45)|0);
  $47 = (_unpack($44,$nbit,$46)|0);
  $48 = $i;
  $49 = (($lspd_indexes) + ($48<<2)|0);
  HEAP32[$49>>2] = $47;
  $50 = $i;
  $51 = (($50) + 1)|0;
  $i = $51;
 }
 $52 = ((($lsps)) + 40|0);
 _decode_lspds_scalar($52,$lspd_indexes,10);
 $53 = $0;
 $54 = ((($53)) + 7984|0);
 $55 = ((($model)) + 660|0);
 _interp_Wo($model,$54,$55);
 $56 = $0;
 $57 = ((($56)) + 8684|0);
 $58 = +HEAPF32[$57>>2];
 $59 = ((($e)) + 4|0);
 $60 = +HEAPF32[$59>>2];
 $61 = (+_interp_energy($58,$60));
 HEAPF32[$e>>2] = $61;
 $62 = $0;
 $63 = ((($62)) + 8644|0);
 $64 = ((($lsps)) + 40|0);
 _interpolate_lsp_ver2($lsps,$63,$64,0.5,10);
 $i = 0;
 while(1) {
  $65 = $i;
  $66 = ($65|0)<(2);
  if (!($66)) {
   break;
  }
  $67 = $i;
  $68 = (($lsps) + (($67*40)|0)|0);
  $69 = $i;
  $70 = (($ak) + (($69*44)|0)|0);
  _lsp_to_lpc($68,$70,10);
  $71 = $0;
  $72 = ((($71)) + 8|0);
  $73 = HEAP32[$72>>2]|0;
  $74 = $i;
  $75 = (($ak) + (($74*44)|0)|0);
  $76 = $i;
  $77 = (($model) + (($76*660)|0)|0);
  $78 = $i;
  $79 = (($e) + ($78<<2)|0);
  $80 = +HEAPF32[$79>>2];
  $81 = $0;
  $82 = ((($81)) + 8688|0);
  $83 = HEAP32[$82>>2]|0;
  $84 = $0;
  $85 = ((($84)) + 8692|0);
  $86 = HEAP32[$85>>2]|0;
  $87 = $0;
  $88 = ((($87)) + 8696|0);
  $89 = +HEAPF32[$88>>2];
  $90 = $0;
  $91 = ((($90)) + 8700|0);
  $92 = +HEAPF32[$91>>2];
  _aks_to_M2($73,$75,10,$77,$80,$snr,0,0,$83,$86,$89,$92,$Aw);
  $93 = $i;
  $94 = (($model) + (($93*660)|0)|0);
  _apply_lpc_correction($94);
  $95 = $0;
  $96 = $i;
  $97 = ($96*80)|0;
  $98 = $1;
  $99 = (($98) + ($97<<1)|0);
  $100 = $i;
  $101 = (($model) + (($100*660)|0)|0);
  _synthesise_one_frame($95,$99,$101,$Aw);
  $102 = $i;
  $103 = (($102) + 1)|0;
  $i = $103;
 }
 $104 = $0;
 $105 = ((($104)) + 7984|0);
 $106 = ((($model)) + 660|0);
 _memcpy(($105|0),($106|0),660)|0;
 $107 = ((($e)) + 4|0);
 $108 = +HEAPF32[$107>>2];
 $109 = $0;
 $110 = ((($109)) + 8684|0);
 HEAPF32[$110>>2] = $108;
 $i = 0;
 while(1) {
  $111 = $i;
  $112 = ($111|0)<(10);
  if (!($112)) {
   break;
  }
  $113 = $i;
  $114 = ((($lsps)) + 40|0);
  $115 = (($114) + ($113<<2)|0);
  $116 = +HEAPF32[$115>>2];
  $117 = $i;
  $118 = $0;
  $119 = ((($118)) + 8644|0);
  $120 = (($119) + ($117<<2)|0);
  HEAPF32[$120>>2] = $116;
  $121 = $i;
  $122 = (($121) + 1)|0;
  $i = $122;
 }
 STACKTOP = sp;return;
}
function _synthesise_one_frame($c2,$speech,$model,$Aw) {
 $c2 = $c2|0;
 $speech = $speech|0;
 $model = $model|0;
 $Aw = $Aw|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0.0, $31 = 0.0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0.0, $4 = 0, $40 = 0.0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0.0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $c2;
 $1 = $speech;
 $2 = $model;
 $3 = $Aw;
 $4 = $0;
 $5 = ((($4)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $2;
 $8 = $0;
 $9 = ((($8)) + 7972|0);
 $10 = $3;
 _phase_synth_zero_order($6,$7,$9,$10);
 $11 = $2;
 $12 = $0;
 $13 = ((($12)) + 7976|0);
 _postfilter($11,$13);
 $14 = $0;
 $15 = ((($14)) + 7328|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = $0;
 $18 = ((($17)) + 7332|0);
 $19 = $2;
 $20 = $0;
 $21 = ((($20)) + 5388|0);
 _synthesise($16,$18,$19,$21,1);
 $22 = $0;
 $23 = ((($22)) + 7332|0);
 _ear_protection($23,80);
 $i = 0;
 while(1) {
  $24 = $i;
  $25 = ($24|0)<(80);
  if (!($25)) {
   break;
  }
  $26 = $i;
  $27 = $0;
  $28 = ((($27)) + 7332|0);
  $29 = (($28) + ($26<<2)|0);
  $30 = +HEAPF32[$29>>2];
  $31 = $30;
  $32 = $31 > 32767.0;
  $33 = $i;
  do {
   if ($32) {
    $34 = $1;
    $35 = (($34) + ($33<<1)|0);
    HEAP16[$35>>1] = 32767;
   } else {
    $36 = $0;
    $37 = ((($36)) + 7332|0);
    $38 = (($37) + ($33<<2)|0);
    $39 = +HEAPF32[$38>>2];
    $40 = $39;
    $41 = $40 < -32767.0;
    $42 = $i;
    if ($41) {
     $43 = $1;
     $44 = (($43) + ($42<<1)|0);
     HEAP16[$44>>1] = -32767;
     break;
    } else {
     $45 = $0;
     $46 = ((($45)) + 7332|0);
     $47 = (($46) + ($42<<2)|0);
     $48 = +HEAPF32[$47>>2];
     $49 = (~~(($48)));
     $50 = $i;
     $51 = $1;
     $52 = (($51) + ($50<<1)|0);
     HEAP16[$52>>1] = $49;
     break;
    }
   }
  } while(0);
  $53 = $i;
  $54 = (($53) + 1)|0;
  $i = $54;
 }
 STACKTOP = sp;return;
}
function _ear_protection($in_out,$n) {
 $in_out = $in_out|0;
 $n = $n|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0.0, $15 = 0, $16 = 0, $17 = 0.0, $18 = 0.0, $19 = 0.0, $2 = 0, $20 = 0.0, $21 = 0.0, $22 = 0.0, $23 = 0, $24 = 0.0, $25 = 0.0, $26 = 0.0;
 var $27 = 0.0, $28 = 0.0, $29 = 0.0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0.0, $34 = 0, $35 = 0, $36 = 0, $37 = 0.0, $38 = 0.0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0;
 var $9 = 0.0, $gain = 0.0, $i = 0, $max_sample = 0.0, $over = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $in_out;
 $1 = $n;
 $max_sample = 0.0;
 $i = 0;
 while(1) {
  $2 = $i;
  $3 = $1;
  $4 = ($2|0)<($3|0);
  if (!($4)) {
   break;
  }
  $5 = $i;
  $6 = $0;
  $7 = (($6) + ($5<<2)|0);
  $8 = +HEAPF32[$7>>2];
  $9 = $max_sample;
  $10 = $8 > $9;
  if ($10) {
   $11 = $i;
   $12 = $0;
   $13 = (($12) + ($11<<2)|0);
   $14 = +HEAPF32[$13>>2];
   $max_sample = $14;
  }
  $15 = $i;
  $16 = (($15) + 1)|0;
  $i = $16;
 }
 $17 = $max_sample;
 $18 = $17;
 $19 = $18 / 3.0E+4;
 $20 = $19;
 $over = $20;
 $21 = $over;
 $22 = $21;
 $23 = $22 > 1.0;
 if (!($23)) {
  STACKTOP = sp;return;
 }
 $24 = $over;
 $25 = $over;
 $26 = $24 * $25;
 $27 = $26;
 $28 = 1.0 / $27;
 $29 = $28;
 $gain = $29;
 $i = 0;
 while(1) {
  $30 = $i;
  $31 = $1;
  $32 = ($30|0)<($31|0);
  if (!($32)) {
   break;
  }
  $33 = $gain;
  $34 = $i;
  $35 = $0;
  $36 = (($35) + ($34<<2)|0);
  $37 = +HEAPF32[$36>>2];
  $38 = $37 * $33;
  HEAPF32[$36>>2] = $38;
  $39 = $i;
  $40 = (($39) + 1)|0;
  $i = $40;
 }
 STACKTOP = sp;return;
}
function _codec2_decode_2400($c2,$speech,$bits) {
 $c2 = $c2|0;
 $speech = $speech|0;
 $bits = $bits|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0.0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0.0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $12 = 0;
 var $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0;
 var $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $5 = 0, $50 = 0.0, $51 = 0, $52 = 0.0, $53 = 0.0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0;
 var $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0.0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0.0, $82 = 0, $83 = 0, $84 = 0.0, $85 = 0;
 var $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $Aw = 0, $WoE_index = 0, $ak = 0, $e = 0, $i = 0;
 var $j = 0, $lsp_indexes = 0, $lsps = 0, $model = 0, $nbit = 0, $snr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 5680|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $model = sp + 4344|0;
 $lsp_indexes = sp + 4304|0;
 $lsps = sp + 4224|0;
 $e = sp + 4208|0;
 $snr = sp + 4200|0;
 $ak = sp + 4112|0;
 $nbit = sp + 4096|0;
 $Aw = sp;
 $0 = $c2;
 $1 = $speech;
 $2 = $bits;
 HEAP32[$nbit>>2] = 0;
 $3 = $0;
 $4 = ($3|0)!=(0|0);
 if (!($4)) {
  ___assert_fail((50542|0),(50512|0),567,(50873|0));
  // unreachable;
 }
 $i = 0;
 while(1) {
  $5 = $i;
  $6 = ($5|0)<(2);
  if (!($6)) {
   break;
  }
  $j = 1;
  while(1) {
   $7 = $j;
   $8 = ($7|0)<=(80);
   if (!($8)) {
    break;
   }
   $9 = $j;
   $10 = $i;
   $11 = (($model) + (($10*660)|0)|0);
   $12 = ((($11)) + 8|0);
   $13 = (($12) + ($9<<2)|0);
   HEAPF32[$13>>2] = 0.0;
   $14 = $j;
   $15 = (($14) + 1)|0;
   $j = $15;
  }
  $16 = $i;
  $17 = (($16) + 1)|0;
  $i = $17;
 }
 $18 = $2;
 $19 = (_unpack($18,$nbit,1)|0);
 $20 = ((($model)) + 656|0);
 HEAP32[$20>>2] = $19;
 $21 = $2;
 $22 = (_unpack($21,$nbit,1)|0);
 $23 = ((($model)) + 660|0);
 $24 = ((($23)) + 656|0);
 HEAP32[$24>>2] = $22;
 $25 = $2;
 $26 = (_unpack($25,$nbit,8)|0);
 $WoE_index = $26;
 $27 = ((($model)) + 660|0);
 $28 = ((($e)) + 4|0);
 $29 = $0;
 $30 = ((($29)) + 8712|0);
 $31 = $WoE_index;
 _decode_WoE($27,$28,$30,$31);
 $i = 0;
 while(1) {
  $32 = $i;
  $33 = ($32|0)<(10);
  if (!($33)) {
   break;
  }
  $34 = $2;
  $35 = $i;
  $36 = (_lsp_bits($35)|0);
  $37 = (_unpack($34,$nbit,$36)|0);
  $38 = $i;
  $39 = (($lsp_indexes) + ($38<<2)|0);
  HEAP32[$39>>2] = $37;
  $40 = $i;
  $41 = (($40) + 1)|0;
  $i = $41;
 }
 $42 = ((($lsps)) + 40|0);
 _decode_lsps_scalar($42,$lsp_indexes,10);
 $43 = ((($lsps)) + 40|0);
 (_check_lsp_order($43,10)|0);
 $44 = ((($lsps)) + 40|0);
 _bw_expand_lsps($44,10,50.0,100.0);
 $45 = $0;
 $46 = ((($45)) + 7984|0);
 $47 = ((($model)) + 660|0);
 _interp_Wo($model,$46,$47);
 $48 = $0;
 $49 = ((($48)) + 8684|0);
 $50 = +HEAPF32[$49>>2];
 $51 = ((($e)) + 4|0);
 $52 = +HEAPF32[$51>>2];
 $53 = (+_interp_energy($50,$52));
 HEAPF32[$e>>2] = $53;
 $54 = $0;
 $55 = ((($54)) + 8644|0);
 $56 = ((($lsps)) + 40|0);
 _interpolate_lsp_ver2($lsps,$55,$56,0.5,10);
 $i = 0;
 while(1) {
  $57 = $i;
  $58 = ($57|0)<(2);
  if (!($58)) {
   break;
  }
  $59 = $i;
  $60 = (($lsps) + (($59*40)|0)|0);
  $61 = $i;
  $62 = (($ak) + (($61*44)|0)|0);
  _lsp_to_lpc($60,$62,10);
  $63 = $0;
  $64 = ((($63)) + 8|0);
  $65 = HEAP32[$64>>2]|0;
  $66 = $i;
  $67 = (($ak) + (($66*44)|0)|0);
  $68 = $i;
  $69 = (($model) + (($68*660)|0)|0);
  $70 = $i;
  $71 = (($e) + ($70<<2)|0);
  $72 = +HEAPF32[$71>>2];
  $73 = $0;
  $74 = ((($73)) + 8688|0);
  $75 = HEAP32[$74>>2]|0;
  $76 = $0;
  $77 = ((($76)) + 8692|0);
  $78 = HEAP32[$77>>2]|0;
  $79 = $0;
  $80 = ((($79)) + 8696|0);
  $81 = +HEAPF32[$80>>2];
  $82 = $0;
  $83 = ((($82)) + 8700|0);
  $84 = +HEAPF32[$83>>2];
  _aks_to_M2($65,$67,10,$69,$72,$snr,0,0,$75,$78,$81,$84,$Aw);
  $85 = $i;
  $86 = (($model) + (($85*660)|0)|0);
  _apply_lpc_correction($86);
  $87 = $0;
  $88 = $i;
  $89 = ($88*80)|0;
  $90 = $1;
  $91 = (($90) + ($89<<1)|0);
  $92 = $i;
  $93 = (($model) + (($92*660)|0)|0);
  _synthesise_one_frame($87,$91,$93,$Aw);
  $94 = $i;
  $95 = (($94) + 1)|0;
  $i = $95;
 }
 $96 = $0;
 $97 = ((($96)) + 7984|0);
 $98 = ((($model)) + 660|0);
 _memcpy(($97|0),($98|0),660)|0;
 $99 = ((($e)) + 4|0);
 $100 = +HEAPF32[$99>>2];
 $101 = $0;
 $102 = ((($101)) + 8684|0);
 HEAPF32[$102>>2] = $100;
 $i = 0;
 while(1) {
  $103 = $i;
  $104 = ($103|0)<(10);
  if (!($104)) {
   break;
  }
  $105 = $i;
  $106 = ((($lsps)) + 40|0);
  $107 = (($106) + ($105<<2)|0);
  $108 = +HEAPF32[$107>>2];
  $109 = $i;
  $110 = $0;
  $111 = ((($110)) + 8644|0);
  $112 = (($111) + ($109<<2)|0);
  HEAPF32[$112>>2] = $108;
  $113 = $i;
  $114 = (($113) + 1)|0;
  $i = $114;
 }
 STACKTOP = sp;return;
}
function _codec2_decode_1600($c2,$speech,$bits) {
 $c2 = $c2|0;
 $speech = $speech|0;
 $bits = $bits|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0.0, $106 = 0, $107 = 0, $108 = 0.0, $109 = 0.0, $11 = 0, $110 = 0.0, $111 = 0.0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0.0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0.0, $137 = 0, $138 = 0, $139 = 0.0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0.0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0.0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0.0, $29 = 0, $3 = 0, $30 = 0, $31 = 0.0, $32 = 0.0, $33 = 0.0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0.0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0.0;
 var $54 = 0, $55 = 0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0.0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0.0, $86 = 0, $87 = 0.0, $88 = 0.0, $89 = 0, $9 = 0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0.0, $94 = 0, $95 = 0.0, $96 = 0.0, $97 = 0, $98 = 0, $99 = 0, $Aw = 0, $Wo_index = 0, $ak = 0, $e = 0, $e_index = 0, $i = 0, $j = 0, $lsp_indexes = 0, $lsps = 0, $model = 0;
 var $nbit = 0, $snr = 0, $weight = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 7184|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $model = sp + 4520|0;
 $lsp_indexes = sp + 4480|0;
 $lsps = sp + 4320|0;
 $e = sp + 4296|0;
 $snr = sp + 4288|0;
 $ak = sp + 4112|0;
 $nbit = sp + 4100|0;
 $Aw = sp;
 $0 = $c2;
 $1 = $speech;
 $2 = $bits;
 HEAP32[$nbit>>2] = 0;
 $3 = $0;
 $4 = ($3|0)!=(0|0);
 if (!($4)) {
  ___assert_fail((50542|0),(50512|0),733,(50892|0));
  // unreachable;
 }
 $i = 0;
 while(1) {
  $5 = $i;
  $6 = ($5|0)<(4);
  if (!($6)) {
   break;
  }
  $j = 1;
  while(1) {
   $7 = $j;
   $8 = ($7|0)<=(80);
   if (!($8)) {
    break;
   }
   $9 = $j;
   $10 = $i;
   $11 = (($model) + (($10*660)|0)|0);
   $12 = ((($11)) + 8|0);
   $13 = (($12) + ($9<<2)|0);
   HEAPF32[$13>>2] = 0.0;
   $14 = $j;
   $15 = (($14) + 1)|0;
   $j = $15;
  }
  $16 = $i;
  $17 = (($16) + 1)|0;
  $i = $17;
 }
 $18 = $2;
 $19 = (_unpack($18,$nbit,1)|0);
 $20 = ((($model)) + 656|0);
 HEAP32[$20>>2] = $19;
 $21 = $2;
 $22 = (_unpack($21,$nbit,1)|0);
 $23 = ((($model)) + 660|0);
 $24 = ((($23)) + 656|0);
 HEAP32[$24>>2] = $22;
 $25 = $2;
 $26 = (_unpack($25,$nbit,7)|0);
 $Wo_index = $26;
 $27 = $Wo_index;
 $28 = (+_decode_Wo($27,7));
 $29 = ((($model)) + 660|0);
 HEAPF32[$29>>2] = $28;
 $30 = ((($model)) + 660|0);
 $31 = +HEAPF32[$30>>2];
 $32 = $31;
 $33 = 3.1415926540000001 / $32;
 $34 = (~~(($33)));
 $35 = ((($model)) + 660|0);
 $36 = ((($35)) + 4|0);
 HEAP32[$36>>2] = $34;
 $37 = $2;
 $38 = (_unpack($37,$nbit,5)|0);
 $e_index = $38;
 $39 = $e_index;
 $40 = (+_decode_energy($39,5));
 $41 = ((($e)) + 4|0);
 HEAPF32[$41>>2] = $40;
 $42 = $2;
 $43 = (_unpack($42,$nbit,1)|0);
 $44 = ((($model)) + 1320|0);
 $45 = ((($44)) + 656|0);
 HEAP32[$45>>2] = $43;
 $46 = $2;
 $47 = (_unpack($46,$nbit,1)|0);
 $48 = ((($model)) + 1980|0);
 $49 = ((($48)) + 656|0);
 HEAP32[$49>>2] = $47;
 $50 = $2;
 $51 = (_unpack($50,$nbit,7)|0);
 $Wo_index = $51;
 $52 = $Wo_index;
 $53 = (+_decode_Wo($52,7));
 $54 = ((($model)) + 1980|0);
 HEAPF32[$54>>2] = $53;
 $55 = ((($model)) + 1980|0);
 $56 = +HEAPF32[$55>>2];
 $57 = $56;
 $58 = 3.1415926540000001 / $57;
 $59 = (~~(($58)));
 $60 = ((($model)) + 1980|0);
 $61 = ((($60)) + 4|0);
 HEAP32[$61>>2] = $59;
 $62 = $2;
 $63 = (_unpack($62,$nbit,5)|0);
 $e_index = $63;
 $64 = $e_index;
 $65 = (+_decode_energy($64,5));
 $66 = ((($e)) + 12|0);
 HEAPF32[$66>>2] = $65;
 $i = 0;
 while(1) {
  $67 = $i;
  $68 = ($67|0)<(10);
  if (!($68)) {
   break;
  }
  $69 = $2;
  $70 = $i;
  $71 = (_lsp_bits($70)|0);
  $72 = (_unpack($69,$nbit,$71)|0);
  $73 = $i;
  $74 = (($lsp_indexes) + ($73<<2)|0);
  HEAP32[$74>>2] = $72;
  $75 = $i;
  $76 = (($75) + 1)|0;
  $i = $76;
 }
 $77 = ((($lsps)) + 120|0);
 _decode_lsps_scalar($77,$lsp_indexes,10);
 $78 = ((($lsps)) + 120|0);
 (_check_lsp_order($78,10)|0);
 $79 = ((($lsps)) + 120|0);
 _bw_expand_lsps($79,10,50.0,100.0);
 $80 = $0;
 $81 = ((($80)) + 7984|0);
 $82 = ((($model)) + 660|0);
 _interp_Wo($model,$81,$82);
 $83 = $0;
 $84 = ((($83)) + 8684|0);
 $85 = +HEAPF32[$84>>2];
 $86 = ((($e)) + 4|0);
 $87 = +HEAPF32[$86>>2];
 $88 = (+_interp_energy($85,$87));
 HEAPF32[$e>>2] = $88;
 $89 = ((($model)) + 1320|0);
 $90 = ((($model)) + 660|0);
 $91 = ((($model)) + 1980|0);
 _interp_Wo($89,$90,$91);
 $92 = ((($e)) + 4|0);
 $93 = +HEAPF32[$92>>2];
 $94 = ((($e)) + 12|0);
 $95 = +HEAPF32[$94>>2];
 $96 = (+_interp_energy($93,$95));
 $97 = ((($e)) + 8|0);
 HEAPF32[$97>>2] = $96;
 $i = 0;
 $weight = 0.25;
 while(1) {
  $98 = $i;
  $99 = ($98|0)<(3);
  if (!($99)) {
   break;
  }
  $100 = $i;
  $101 = (($lsps) + (($100*40)|0)|0);
  $102 = $0;
  $103 = ((($102)) + 8644|0);
  $104 = ((($lsps)) + 120|0);
  $105 = $weight;
  _interpolate_lsp_ver2($101,$103,$104,$105,10);
  $106 = $i;
  $107 = (($106) + 1)|0;
  $i = $107;
  $108 = $weight;
  $109 = $108;
  $110 = $109 + 0.25;
  $111 = $110;
  $weight = $111;
 }
 $i = 0;
 while(1) {
  $112 = $i;
  $113 = ($112|0)<(4);
  if (!($113)) {
   break;
  }
  $114 = $i;
  $115 = (($lsps) + (($114*40)|0)|0);
  $116 = $i;
  $117 = (($ak) + (($116*44)|0)|0);
  _lsp_to_lpc($115,$117,10);
  $118 = $0;
  $119 = ((($118)) + 8|0);
  $120 = HEAP32[$119>>2]|0;
  $121 = $i;
  $122 = (($ak) + (($121*44)|0)|0);
  $123 = $i;
  $124 = (($model) + (($123*660)|0)|0);
  $125 = $i;
  $126 = (($e) + ($125<<2)|0);
  $127 = +HEAPF32[$126>>2];
  $128 = $0;
  $129 = ((($128)) + 8688|0);
  $130 = HEAP32[$129>>2]|0;
  $131 = $0;
  $132 = ((($131)) + 8692|0);
  $133 = HEAP32[$132>>2]|0;
  $134 = $0;
  $135 = ((($134)) + 8696|0);
  $136 = +HEAPF32[$135>>2];
  $137 = $0;
  $138 = ((($137)) + 8700|0);
  $139 = +HEAPF32[$138>>2];
  _aks_to_M2($120,$122,10,$124,$127,$snr,0,0,$130,$133,$136,$139,$Aw);
  $140 = $i;
  $141 = (($model) + (($140*660)|0)|0);
  _apply_lpc_correction($141);
  $142 = $0;
  $143 = $i;
  $144 = ($143*80)|0;
  $145 = $1;
  $146 = (($145) + ($144<<1)|0);
  $147 = $i;
  $148 = (($model) + (($147*660)|0)|0);
  _synthesise_one_frame($142,$146,$148,$Aw);
  $149 = $i;
  $150 = (($149) + 1)|0;
  $i = $150;
 }
 $151 = $0;
 $152 = ((($151)) + 7984|0);
 $153 = ((($model)) + 1980|0);
 _memcpy(($152|0),($153|0),660)|0;
 $154 = ((($e)) + 12|0);
 $155 = +HEAPF32[$154>>2];
 $156 = $0;
 $157 = ((($156)) + 8684|0);
 HEAPF32[$157>>2] = $155;
 $i = 0;
 while(1) {
  $158 = $i;
  $159 = ($158|0)<(10);
  if (!($159)) {
   break;
  }
  $160 = $i;
  $161 = ((($lsps)) + 120|0);
  $162 = (($161) + ($160<<2)|0);
  $163 = +HEAPF32[$162>>2];
  $164 = $i;
  $165 = $0;
  $166 = ((($165)) + 8644|0);
  $167 = (($166) + ($164<<2)|0);
  HEAPF32[$167>>2] = $163;
  $168 = $i;
  $169 = (($168) + 1)|0;
  $i = $169;
 }
 STACKTOP = sp;return;
}
function _codec2_decode_1400($c2,$speech,$bits) {
 $c2 = $c2|0;
 $speech = $speech|0;
 $bits = $bits|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0.0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $117 = 0, $118 = 0, $119 = 0.0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0.0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0.0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $16 = 0, $17 = 0;
 var $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0.0, $66 = 0, $67 = 0.0, $68 = 0.0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0.0, $74 = 0, $75 = 0.0, $76 = 0.0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0.0, $86 = 0, $87 = 0, $88 = 0.0, $89 = 0.0, $9 = 0;
 var $90 = 0.0, $91 = 0.0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $Aw = 0, $WoE_index = 0, $ak = 0, $e = 0, $i = 0, $j = 0, $lsp_indexes = 0, $lsps = 0, $model = 0, $nbit = 0;
 var $snr = 0, $weight = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 7184|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $model = sp + 4520|0;
 $lsp_indexes = sp + 4480|0;
 $lsps = sp + 4320|0;
 $e = sp + 4296|0;
 $snr = sp + 4288|0;
 $ak = sp + 4112|0;
 $nbit = sp + 4100|0;
 $Aw = sp;
 $0 = $c2;
 $1 = $speech;
 $2 = $bits;
 HEAP32[$nbit>>2] = 0;
 $3 = $0;
 $4 = ($3|0)!=(0|0);
 if (!($4)) {
  ___assert_fail((50542|0),(50512|0),911,(50911|0));
  // unreachable;
 }
 $i = 0;
 while(1) {
  $5 = $i;
  $6 = ($5|0)<(4);
  if (!($6)) {
   break;
  }
  $j = 1;
  while(1) {
   $7 = $j;
   $8 = ($7|0)<=(80);
   if (!($8)) {
    break;
   }
   $9 = $j;
   $10 = $i;
   $11 = (($model) + (($10*660)|0)|0);
   $12 = ((($11)) + 8|0);
   $13 = (($12) + ($9<<2)|0);
   HEAPF32[$13>>2] = 0.0;
   $14 = $j;
   $15 = (($14) + 1)|0;
   $j = $15;
  }
  $16 = $i;
  $17 = (($16) + 1)|0;
  $i = $17;
 }
 $18 = $2;
 $19 = (_unpack($18,$nbit,1)|0);
 $20 = ((($model)) + 656|0);
 HEAP32[$20>>2] = $19;
 $21 = $2;
 $22 = (_unpack($21,$nbit,1)|0);
 $23 = ((($model)) + 660|0);
 $24 = ((($23)) + 656|0);
 HEAP32[$24>>2] = $22;
 $25 = $2;
 $26 = (_unpack($25,$nbit,8)|0);
 $WoE_index = $26;
 $27 = ((($model)) + 660|0);
 $28 = ((($e)) + 4|0);
 $29 = $0;
 $30 = ((($29)) + 8712|0);
 $31 = $WoE_index;
 _decode_WoE($27,$28,$30,$31);
 $32 = $2;
 $33 = (_unpack($32,$nbit,1)|0);
 $34 = ((($model)) + 1320|0);
 $35 = ((($34)) + 656|0);
 HEAP32[$35>>2] = $33;
 $36 = $2;
 $37 = (_unpack($36,$nbit,1)|0);
 $38 = ((($model)) + 1980|0);
 $39 = ((($38)) + 656|0);
 HEAP32[$39>>2] = $37;
 $40 = $2;
 $41 = (_unpack($40,$nbit,8)|0);
 $WoE_index = $41;
 $42 = ((($model)) + 1980|0);
 $43 = ((($e)) + 12|0);
 $44 = $0;
 $45 = ((($44)) + 8712|0);
 $46 = $WoE_index;
 _decode_WoE($42,$43,$45,$46);
 $i = 0;
 while(1) {
  $47 = $i;
  $48 = ($47|0)<(10);
  if (!($48)) {
   break;
  }
  $49 = $2;
  $50 = $i;
  $51 = (_lsp_bits($50)|0);
  $52 = (_unpack($49,$nbit,$51)|0);
  $53 = $i;
  $54 = (($lsp_indexes) + ($53<<2)|0);
  HEAP32[$54>>2] = $52;
  $55 = $i;
  $56 = (($55) + 1)|0;
  $i = $56;
 }
 $57 = ((($lsps)) + 120|0);
 _decode_lsps_scalar($57,$lsp_indexes,10);
 $58 = ((($lsps)) + 120|0);
 (_check_lsp_order($58,10)|0);
 $59 = ((($lsps)) + 120|0);
 _bw_expand_lsps($59,10,50.0,100.0);
 $60 = $0;
 $61 = ((($60)) + 7984|0);
 $62 = ((($model)) + 660|0);
 _interp_Wo($model,$61,$62);
 $63 = $0;
 $64 = ((($63)) + 8684|0);
 $65 = +HEAPF32[$64>>2];
 $66 = ((($e)) + 4|0);
 $67 = +HEAPF32[$66>>2];
 $68 = (+_interp_energy($65,$67));
 HEAPF32[$e>>2] = $68;
 $69 = ((($model)) + 1320|0);
 $70 = ((($model)) + 660|0);
 $71 = ((($model)) + 1980|0);
 _interp_Wo($69,$70,$71);
 $72 = ((($e)) + 4|0);
 $73 = +HEAPF32[$72>>2];
 $74 = ((($e)) + 12|0);
 $75 = +HEAPF32[$74>>2];
 $76 = (+_interp_energy($73,$75));
 $77 = ((($e)) + 8|0);
 HEAPF32[$77>>2] = $76;
 $i = 0;
 $weight = 0.25;
 while(1) {
  $78 = $i;
  $79 = ($78|0)<(3);
  if (!($79)) {
   break;
  }
  $80 = $i;
  $81 = (($lsps) + (($80*40)|0)|0);
  $82 = $0;
  $83 = ((($82)) + 8644|0);
  $84 = ((($lsps)) + 120|0);
  $85 = $weight;
  _interpolate_lsp_ver2($81,$83,$84,$85,10);
  $86 = $i;
  $87 = (($86) + 1)|0;
  $i = $87;
  $88 = $weight;
  $89 = $88;
  $90 = $89 + 0.25;
  $91 = $90;
  $weight = $91;
 }
 $i = 0;
 while(1) {
  $92 = $i;
  $93 = ($92|0)<(4);
  if (!($93)) {
   break;
  }
  $94 = $i;
  $95 = (($lsps) + (($94*40)|0)|0);
  $96 = $i;
  $97 = (($ak) + (($96*44)|0)|0);
  _lsp_to_lpc($95,$97,10);
  $98 = $0;
  $99 = ((($98)) + 8|0);
  $100 = HEAP32[$99>>2]|0;
  $101 = $i;
  $102 = (($ak) + (($101*44)|0)|0);
  $103 = $i;
  $104 = (($model) + (($103*660)|0)|0);
  $105 = $i;
  $106 = (($e) + ($105<<2)|0);
  $107 = +HEAPF32[$106>>2];
  $108 = $0;
  $109 = ((($108)) + 8688|0);
  $110 = HEAP32[$109>>2]|0;
  $111 = $0;
  $112 = ((($111)) + 8692|0);
  $113 = HEAP32[$112>>2]|0;
  $114 = $0;
  $115 = ((($114)) + 8696|0);
  $116 = +HEAPF32[$115>>2];
  $117 = $0;
  $118 = ((($117)) + 8700|0);
  $119 = +HEAPF32[$118>>2];
  _aks_to_M2($100,$102,10,$104,$107,$snr,0,0,$110,$113,$116,$119,$Aw);
  $120 = $i;
  $121 = (($model) + (($120*660)|0)|0);
  _apply_lpc_correction($121);
  $122 = $0;
  $123 = $i;
  $124 = ($123*80)|0;
  $125 = $1;
  $126 = (($125) + ($124<<1)|0);
  $127 = $i;
  $128 = (($model) + (($127*660)|0)|0);
  _synthesise_one_frame($122,$126,$128,$Aw);
  $129 = $i;
  $130 = (($129) + 1)|0;
  $i = $130;
 }
 $131 = $0;
 $132 = ((($131)) + 7984|0);
 $133 = ((($model)) + 1980|0);
 _memcpy(($132|0),($133|0),660)|0;
 $134 = ((($e)) + 12|0);
 $135 = +HEAPF32[$134>>2];
 $136 = $0;
 $137 = ((($136)) + 8684|0);
 HEAPF32[$137>>2] = $135;
 $i = 0;
 while(1) {
  $138 = $i;
  $139 = ($138|0)<(10);
  if (!($139)) {
   break;
  }
  $140 = $i;
  $141 = ((($lsps)) + 120|0);
  $142 = (($141) + ($140<<2)|0);
  $143 = +HEAPF32[$142>>2];
  $144 = $i;
  $145 = $0;
  $146 = ((($145)) + 8644|0);
  $147 = (($146) + ($144<<2)|0);
  HEAPF32[$147>>2] = $143;
  $148 = $i;
  $149 = (($148) + 1)|0;
  $i = $149;
 }
 STACKTOP = sp;return;
}
function _codec2_decode_1300($c2,$speech,$bits,$ber_est) {
 $c2 = $c2|0;
 $speech = $speech|0;
 $bits = $bits|0;
 $ber_est = +$ber_est;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0.0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0.0, $115 = 0;
 var $116 = 0, $117 = 0.0, $118 = 0, $119 = 0.0, $12 = 0, $120 = 0.0, $121 = 0.0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0.0, $127 = 0.0, $128 = 0.0, $129 = 0.0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0.0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0.0, $155 = 0, $156 = 0, $157 = 0.0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0.0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0.0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $19 = 0;
 var $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0.0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0;
 var $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0.0, $55 = 0;
 var $56 = 0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0.0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0;
 var $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0.0, $88 = 0.0, $89 = 0, $9 = 0, $90 = 0, $91 = 0;
 var $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0.0, $98 = 0, $99 = 0, $Aw = 0, $Wo_index = 0, $ak = 0, $e = 0, $e_index = 0, $i = 0, $j = 0, $lsp_indexes = 0, $lsps = 0, $model = 0, $nbit = 0, $snr = 0;
 var $vararg_buffer = 0, $weight = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 7184|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $model = sp + 4528|0;
 $lsp_indexes = sp + 4488|0;
 $lsps = sp + 4328|0;
 $e = sp + 4304|0;
 $snr = sp + 4296|0;
 $ak = sp + 4120|0;
 $nbit = sp + 4108|0;
 $Aw = sp + 8|0;
 $0 = $c2;
 $1 = $speech;
 $2 = $bits;
 $3 = $ber_est;
 HEAP32[$nbit>>2] = 0;
 $4 = $0;
 $5 = ($4|0)!=(0|0);
 if (!($5)) {
  ___assert_fail((50542|0),(50512|0),1089,(50930|0));
  // unreachable;
 }
 $6 = HEAP32[13425]|0;
 $7 = (($6) + 4)|0;
 HEAP32[13425] = $7;
 $i = 0;
 while(1) {
  $8 = $i;
  $9 = ($8|0)<(4);
  if (!($9)) {
   break;
  }
  $j = 1;
  while(1) {
   $10 = $j;
   $11 = ($10|0)<=(80);
   if (!($11)) {
    break;
   }
   $12 = $j;
   $13 = $i;
   $14 = (($model) + (($13*660)|0)|0);
   $15 = ((($14)) + 8|0);
   $16 = (($15) + ($12<<2)|0);
   HEAPF32[$16>>2] = 0.0;
   $17 = $j;
   $18 = (($17) + 1)|0;
   $j = $18;
  }
  $19 = $i;
  $20 = (($19) + 1)|0;
  $i = $20;
 }
 $21 = $2;
 $22 = $0;
 $23 = ((($22)) + 7324|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = (_unpack_natural_or_gray($21,$nbit,1,$24)|0);
 $26 = ((($model)) + 656|0);
 HEAP32[$26>>2] = $25;
 $27 = $2;
 $28 = $0;
 $29 = ((($28)) + 7324|0);
 $30 = HEAP32[$29>>2]|0;
 $31 = (_unpack_natural_or_gray($27,$nbit,1,$30)|0);
 $32 = ((($model)) + 660|0);
 $33 = ((($32)) + 656|0);
 HEAP32[$33>>2] = $31;
 $34 = $2;
 $35 = $0;
 $36 = ((($35)) + 7324|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = (_unpack_natural_or_gray($34,$nbit,1,$37)|0);
 $39 = ((($model)) + 1320|0);
 $40 = ((($39)) + 656|0);
 HEAP32[$40>>2] = $38;
 $41 = $2;
 $42 = $0;
 $43 = ((($42)) + 7324|0);
 $44 = HEAP32[$43>>2]|0;
 $45 = (_unpack_natural_or_gray($41,$nbit,1,$44)|0);
 $46 = ((($model)) + 1980|0);
 $47 = ((($46)) + 656|0);
 HEAP32[$47>>2] = $45;
 $48 = $2;
 $49 = $0;
 $50 = ((($49)) + 7324|0);
 $51 = HEAP32[$50>>2]|0;
 $52 = (_unpack_natural_or_gray($48,$nbit,7,$51)|0);
 $Wo_index = $52;
 $53 = $Wo_index;
 $54 = (+_decode_Wo($53,7));
 $55 = ((($model)) + 1980|0);
 HEAPF32[$55>>2] = $54;
 $56 = ((($model)) + 1980|0);
 $57 = +HEAPF32[$56>>2];
 $58 = $57;
 $59 = 3.1415926540000001 / $58;
 $60 = (~~(($59)));
 $61 = ((($model)) + 1980|0);
 $62 = ((($61)) + 4|0);
 HEAP32[$62>>2] = $60;
 $63 = $2;
 $64 = $0;
 $65 = ((($64)) + 7324|0);
 $66 = HEAP32[$65>>2]|0;
 $67 = (_unpack_natural_or_gray($63,$nbit,5,$66)|0);
 $e_index = $67;
 $68 = $e_index;
 $69 = (+_decode_energy($68,5));
 $70 = ((($e)) + 12|0);
 HEAPF32[$70>>2] = $69;
 $i = 0;
 while(1) {
  $71 = $i;
  $72 = ($71|0)<(10);
  if (!($72)) {
   break;
  }
  $73 = $2;
  $74 = $i;
  $75 = (_lsp_bits($74)|0);
  $76 = $0;
  $77 = ((($76)) + 7324|0);
  $78 = HEAP32[$77>>2]|0;
  $79 = (_unpack_natural_or_gray($73,$nbit,$75,$78)|0);
  $80 = $i;
  $81 = (($lsp_indexes) + ($80<<2)|0);
  HEAP32[$81>>2] = $79;
  $82 = $i;
  $83 = (($82) + 1)|0;
  $i = $83;
 }
 $84 = ((($lsps)) + 120|0);
 _decode_lsps_scalar($84,$lsp_indexes,10);
 $85 = ((($lsps)) + 120|0);
 (_check_lsp_order($85,10)|0);
 $86 = ((($lsps)) + 120|0);
 _bw_expand_lsps($86,10,50.0,100.0);
 $87 = $3;
 $88 = $87;
 $89 = $88 > 0.14999999999999999;
 if ($89) {
  $90 = ((($model)) + 1980|0);
  $91 = ((($90)) + 656|0);
  HEAP32[$91>>2] = 0;
  $92 = ((($model)) + 1320|0);
  $93 = ((($92)) + 656|0);
  HEAP32[$93>>2] = 0;
  $94 = ((($model)) + 660|0);
  $95 = ((($94)) + 656|0);
  HEAP32[$95>>2] = 0;
  $96 = ((($model)) + 656|0);
  HEAP32[$96>>2] = 0;
  $97 = (+_decode_energy(10,5));
  $98 = ((($e)) + 12|0);
  HEAPF32[$98>>2] = $97;
  $99 = ((($lsps)) + 120|0);
  _bw_expand_lsps($99,10,200.0,200.0);
  $100 = HEAP32[12565]|0;
  (_fprintf($100,50949,$vararg_buffer)|0);
 }
 $i = 0;
 $weight = 0.25;
 while(1) {
  $101 = $i;
  $102 = ($101|0)<(3);
  if (!($102)) {
   break;
  }
  $103 = $i;
  $104 = (($lsps) + (($103*40)|0)|0);
  $105 = $0;
  $106 = ((($105)) + 8644|0);
  $107 = ((($lsps)) + 120|0);
  $108 = $weight;
  _interpolate_lsp_ver2($104,$106,$107,$108,10);
  $109 = $i;
  $110 = (($model) + (($109*660)|0)|0);
  $111 = $0;
  $112 = ((($111)) + 7984|0);
  $113 = ((($model)) + 1980|0);
  $114 = $weight;
  _interp_Wo2($110,$112,$113,$114);
  $115 = $0;
  $116 = ((($115)) + 8684|0);
  $117 = +HEAPF32[$116>>2];
  $118 = ((($e)) + 12|0);
  $119 = +HEAPF32[$118>>2];
  $120 = $weight;
  $121 = (+_interp_energy2($117,$119,$120));
  $122 = $i;
  $123 = (($e) + ($122<<2)|0);
  HEAPF32[$123>>2] = $121;
  $124 = $i;
  $125 = (($124) + 1)|0;
  $i = $125;
  $126 = $weight;
  $127 = $126;
  $128 = $127 + 0.25;
  $129 = $128;
  $weight = $129;
 }
 $i = 0;
 while(1) {
  $130 = $i;
  $131 = ($130|0)<(4);
  if (!($131)) {
   break;
  }
  $132 = $i;
  $133 = (($lsps) + (($132*40)|0)|0);
  $134 = $i;
  $135 = (($ak) + (($134*44)|0)|0);
  _lsp_to_lpc($133,$135,10);
  $136 = $0;
  $137 = ((($136)) + 8|0);
  $138 = HEAP32[$137>>2]|0;
  $139 = $i;
  $140 = (($ak) + (($139*44)|0)|0);
  $141 = $i;
  $142 = (($model) + (($141*660)|0)|0);
  $143 = $i;
  $144 = (($e) + ($143<<2)|0);
  $145 = +HEAPF32[$144>>2];
  $146 = $0;
  $147 = ((($146)) + 8688|0);
  $148 = HEAP32[$147>>2]|0;
  $149 = $0;
  $150 = ((($149)) + 8692|0);
  $151 = HEAP32[$150>>2]|0;
  $152 = $0;
  $153 = ((($152)) + 8696|0);
  $154 = +HEAPF32[$153>>2];
  $155 = $0;
  $156 = ((($155)) + 8700|0);
  $157 = +HEAPF32[$156>>2];
  _aks_to_M2($138,$140,10,$142,$145,$snr,0,0,$148,$151,$154,$157,$Aw);
  $158 = $i;
  $159 = (($model) + (($158*660)|0)|0);
  _apply_lpc_correction($159);
  $160 = $0;
  $161 = $i;
  $162 = ($161*80)|0;
  $163 = $1;
  $164 = (($163) + ($162<<1)|0);
  $165 = $i;
  $166 = (($model) + (($165*660)|0)|0);
  _synthesise_one_frame($160,$164,$166,$Aw);
  $167 = $i;
  $168 = (($167) + 1)|0;
  $i = $168;
 }
 $169 = $0;
 $170 = ((($169)) + 7984|0);
 $171 = ((($model)) + 1980|0);
 _memcpy(($170|0),($171|0),660)|0;
 $172 = ((($e)) + 12|0);
 $173 = +HEAPF32[$172>>2];
 $174 = $0;
 $175 = ((($174)) + 8684|0);
 HEAPF32[$175>>2] = $173;
 $i = 0;
 while(1) {
  $176 = $i;
  $177 = ($176|0)<(10);
  if (!($177)) {
   break;
  }
  $178 = $i;
  $179 = ((($lsps)) + 120|0);
  $180 = (($179) + ($178<<2)|0);
  $181 = +HEAPF32[$180>>2];
  $182 = $i;
  $183 = $0;
  $184 = ((($183)) + 8644|0);
  $185 = (($184) + ($182<<2)|0);
  HEAPF32[$185>>2] = $181;
  $186 = $i;
  $187 = (($186) + 1)|0;
  $i = $187;
 }
 STACKTOP = sp;return;
}
function _codec2_decode_1200($c2,$speech,$bits) {
 $c2 = $c2|0;
 $speech = $speech|0;
 $bits = $bits|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0.0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $117 = 0, $118 = 0, $119 = 0.0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0.0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0.0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $16 = 0, $17 = 0;
 var $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0.0, $66 = 0, $67 = 0.0, $68 = 0.0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0.0, $74 = 0, $75 = 0.0, $76 = 0.0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0.0, $86 = 0, $87 = 0, $88 = 0.0, $89 = 0.0, $9 = 0;
 var $90 = 0.0, $91 = 0.0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $Aw = 0, $WoE_index = 0, $ak = 0, $e = 0, $i = 0, $j = 0, $lsp_indexes = 0, $lsps = 0, $model = 0, $nbit = 0;
 var $snr = 0, $weight = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 7184|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $model = sp + 4520|0;
 $lsp_indexes = sp + 4480|0;
 $lsps = sp + 4320|0;
 $e = sp + 4296|0;
 $snr = sp + 4288|0;
 $ak = sp + 4112|0;
 $nbit = sp + 4100|0;
 $Aw = sp;
 $0 = $c2;
 $1 = $speech;
 $2 = $bits;
 HEAP32[$nbit>>2] = 0;
 $3 = $0;
 $4 = ($3|0)!=(0|0);
 if (!($4)) {
  ___assert_fail((50542|0),(50512|0),1281,(50960|0));
  // unreachable;
 }
 $i = 0;
 while(1) {
  $5 = $i;
  $6 = ($5|0)<(4);
  if (!($6)) {
   break;
  }
  $j = 1;
  while(1) {
   $7 = $j;
   $8 = ($7|0)<=(80);
   if (!($8)) {
    break;
   }
   $9 = $j;
   $10 = $i;
   $11 = (($model) + (($10*660)|0)|0);
   $12 = ((($11)) + 8|0);
   $13 = (($12) + ($9<<2)|0);
   HEAPF32[$13>>2] = 0.0;
   $14 = $j;
   $15 = (($14) + 1)|0;
   $j = $15;
  }
  $16 = $i;
  $17 = (($16) + 1)|0;
  $i = $17;
 }
 $18 = $2;
 $19 = (_unpack($18,$nbit,1)|0);
 $20 = ((($model)) + 656|0);
 HEAP32[$20>>2] = $19;
 $21 = $2;
 $22 = (_unpack($21,$nbit,1)|0);
 $23 = ((($model)) + 660|0);
 $24 = ((($23)) + 656|0);
 HEAP32[$24>>2] = $22;
 $25 = $2;
 $26 = (_unpack($25,$nbit,8)|0);
 $WoE_index = $26;
 $27 = ((($model)) + 660|0);
 $28 = ((($e)) + 4|0);
 $29 = $0;
 $30 = ((($29)) + 8712|0);
 $31 = $WoE_index;
 _decode_WoE($27,$28,$30,$31);
 $32 = $2;
 $33 = (_unpack($32,$nbit,1)|0);
 $34 = ((($model)) + 1320|0);
 $35 = ((($34)) + 656|0);
 HEAP32[$35>>2] = $33;
 $36 = $2;
 $37 = (_unpack($36,$nbit,1)|0);
 $38 = ((($model)) + 1980|0);
 $39 = ((($38)) + 656|0);
 HEAP32[$39>>2] = $37;
 $40 = $2;
 $41 = (_unpack($40,$nbit,8)|0);
 $WoE_index = $41;
 $42 = ((($model)) + 1980|0);
 $43 = ((($e)) + 12|0);
 $44 = $0;
 $45 = ((($44)) + 8712|0);
 $46 = $WoE_index;
 _decode_WoE($42,$43,$45,$46);
 $i = 0;
 while(1) {
  $47 = $i;
  $48 = ($47|0)<(3);
  if (!($48)) {
   break;
  }
  $49 = $2;
  $50 = $i;
  $51 = (_lsp_pred_vq_bits($50)|0);
  $52 = (_unpack($49,$nbit,$51)|0);
  $53 = $i;
  $54 = (($lsp_indexes) + ($53<<2)|0);
  HEAP32[$54>>2] = $52;
  $55 = $i;
  $56 = (($55) + 1)|0;
  $i = $56;
 }
 $57 = ((($lsps)) + 120|0);
 _decode_lsps_vq($lsp_indexes,$57,10,0);
 $58 = ((($lsps)) + 120|0);
 (_check_lsp_order($58,10)|0);
 $59 = ((($lsps)) + 120|0);
 _bw_expand_lsps($59,10,50.0,100.0);
 $60 = $0;
 $61 = ((($60)) + 7984|0);
 $62 = ((($model)) + 660|0);
 _interp_Wo($model,$61,$62);
 $63 = $0;
 $64 = ((($63)) + 8684|0);
 $65 = +HEAPF32[$64>>2];
 $66 = ((($e)) + 4|0);
 $67 = +HEAPF32[$66>>2];
 $68 = (+_interp_energy($65,$67));
 HEAPF32[$e>>2] = $68;
 $69 = ((($model)) + 1320|0);
 $70 = ((($model)) + 660|0);
 $71 = ((($model)) + 1980|0);
 _interp_Wo($69,$70,$71);
 $72 = ((($e)) + 4|0);
 $73 = +HEAPF32[$72>>2];
 $74 = ((($e)) + 12|0);
 $75 = +HEAPF32[$74>>2];
 $76 = (+_interp_energy($73,$75));
 $77 = ((($e)) + 8|0);
 HEAPF32[$77>>2] = $76;
 $i = 0;
 $weight = 0.25;
 while(1) {
  $78 = $i;
  $79 = ($78|0)<(3);
  if (!($79)) {
   break;
  }
  $80 = $i;
  $81 = (($lsps) + (($80*40)|0)|0);
  $82 = $0;
  $83 = ((($82)) + 8644|0);
  $84 = ((($lsps)) + 120|0);
  $85 = $weight;
  _interpolate_lsp_ver2($81,$83,$84,$85,10);
  $86 = $i;
  $87 = (($86) + 1)|0;
  $i = $87;
  $88 = $weight;
  $89 = $88;
  $90 = $89 + 0.25;
  $91 = $90;
  $weight = $91;
 }
 $i = 0;
 while(1) {
  $92 = $i;
  $93 = ($92|0)<(4);
  if (!($93)) {
   break;
  }
  $94 = $i;
  $95 = (($lsps) + (($94*40)|0)|0);
  $96 = $i;
  $97 = (($ak) + (($96*44)|0)|0);
  _lsp_to_lpc($95,$97,10);
  $98 = $0;
  $99 = ((($98)) + 8|0);
  $100 = HEAP32[$99>>2]|0;
  $101 = $i;
  $102 = (($ak) + (($101*44)|0)|0);
  $103 = $i;
  $104 = (($model) + (($103*660)|0)|0);
  $105 = $i;
  $106 = (($e) + ($105<<2)|0);
  $107 = +HEAPF32[$106>>2];
  $108 = $0;
  $109 = ((($108)) + 8688|0);
  $110 = HEAP32[$109>>2]|0;
  $111 = $0;
  $112 = ((($111)) + 8692|0);
  $113 = HEAP32[$112>>2]|0;
  $114 = $0;
  $115 = ((($114)) + 8696|0);
  $116 = +HEAPF32[$115>>2];
  $117 = $0;
  $118 = ((($117)) + 8700|0);
  $119 = +HEAPF32[$118>>2];
  _aks_to_M2($100,$102,10,$104,$107,$snr,0,0,$110,$113,$116,$119,$Aw);
  $120 = $i;
  $121 = (($model) + (($120*660)|0)|0);
  _apply_lpc_correction($121);
  $122 = $0;
  $123 = $i;
  $124 = ($123*80)|0;
  $125 = $1;
  $126 = (($125) + ($124<<1)|0);
  $127 = $i;
  $128 = (($model) + (($127*660)|0)|0);
  _synthesise_one_frame($122,$126,$128,$Aw);
  $129 = $i;
  $130 = (($129) + 1)|0;
  $i = $130;
 }
 $131 = $0;
 $132 = ((($131)) + 7984|0);
 $133 = ((($model)) + 1980|0);
 _memcpy(($132|0),($133|0),660)|0;
 $134 = ((($e)) + 12|0);
 $135 = +HEAPF32[$134>>2];
 $136 = $0;
 $137 = ((($136)) + 8684|0);
 HEAPF32[$137>>2] = $135;
 $i = 0;
 while(1) {
  $138 = $i;
  $139 = ($138|0)<(10);
  if (!($139)) {
   break;
  }
  $140 = $i;
  $141 = ((($lsps)) + 120|0);
  $142 = (($141) + ($140<<2)|0);
  $143 = +HEAPF32[$142>>2];
  $144 = $i;
  $145 = $0;
  $146 = ((($145)) + 8644|0);
  $147 = (($146) + ($144<<2)|0);
  HEAPF32[$147>>2] = $143;
  $148 = $i;
  $149 = (($148) + 1)|0;
  $i = $149;
 }
 STACKTOP = sp;return;
}
function _codec2_decode_700($c2,$speech,$bits) {
 $c2 = $c2|0;
 $speech = $speech|0;
 $bits = $bits|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0.0, $102 = 0, $103 = 0, $104 = 0.0, $105 = 0, $106 = 0.0, $107 = 0.0, $108 = 0.0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0.0, $114 = 0.0, $115 = 0.0;
 var $116 = 0.0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0.0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0.0, $142 = 0, $143 = 0, $144 = 0.0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0.0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0.0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0;
 var $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0.0, $37 = 0, $38 = 0, $39 = 0.0, $4 = 0, $40 = 0.0, $41 = 0.0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $5 = 0, $50 = 0, $51 = 0.0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0;
 var $68 = 0, $69 = 0, $7 = 0, $70 = 0.0, $71 = 0.0, $72 = 0.0, $73 = 0.0, $74 = 0.0, $75 = 0.0, $76 = 0.0, $77 = 0.0, $78 = 0.0, $79 = 0.0, $8 = 0, $80 = 0.0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0;
 var $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0.0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $Aw = 0, $Wo_index = 0, $ak = 0, $e = 0, $e_index = 0;
 var $f_ = 0.0, $i = 0, $indexes = 0, $j = 0, $lsps = 0, $mel = 0, $model = 0, $nbit = 0, $snr = 0, $weight = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 7056|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $model = sp + 4400|0;
 $indexes = sp + 4376|0;
 $mel = sp + 4352|0;
 $lsps = sp + 4256|0;
 $e = sp + 4232|0;
 $snr = sp + 4228|0;
 $ak = sp + 4112|0;
 $nbit = sp + 4100|0;
 $Aw = sp;
 $0 = $c2;
 $1 = $speech;
 $2 = $bits;
 HEAP32[$nbit>>2] = 0;
 $3 = $0;
 $4 = ($3|0)!=(0|0);
 if (!($4)) {
  ___assert_fail((50542|0),(50512|0),1468,(50979|0));
  // unreachable;
 }
 $i = 0;
 while(1) {
  $5 = $i;
  $6 = ($5|0)<(4);
  if (!($6)) {
   break;
  }
  $j = 1;
  while(1) {
   $7 = $j;
   $8 = ($7|0)<=(80);
   if (!($8)) {
    break;
   }
   $9 = $j;
   $10 = $i;
   $11 = (($model) + (($10*660)|0)|0);
   $12 = ((($11)) + 8|0);
   $13 = (($12) + ($9<<2)|0);
   HEAPF32[$13>>2] = 0.0;
   $14 = $j;
   $15 = (($14) + 1)|0;
   $j = $15;
  }
  $16 = $i;
  $17 = (($16) + 1)|0;
  $i = $17;
 }
 $18 = $2;
 $19 = (_unpack($18,$nbit,1)|0);
 $20 = ((($model)) + 1980|0);
 $21 = ((($20)) + 656|0);
 HEAP32[$21>>2] = $19;
 $22 = ((($model)) + 1980|0);
 $23 = ((($22)) + 656|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ((($model)) + 1320|0);
 $26 = ((($25)) + 656|0);
 HEAP32[$26>>2] = $24;
 $27 = ((($model)) + 660|0);
 $28 = ((($27)) + 656|0);
 HEAP32[$28>>2] = $24;
 $29 = ((($model)) + 656|0);
 HEAP32[$29>>2] = $24;
 $30 = $2;
 $31 = $0;
 $32 = ((($31)) + 7324|0);
 $33 = HEAP32[$32>>2]|0;
 $34 = (_unpack_natural_or_gray($30,$nbit,5,$33)|0);
 $Wo_index = $34;
 $35 = $Wo_index;
 $36 = (+_decode_log_Wo($35,5));
 $37 = ((($model)) + 1980|0);
 HEAPF32[$37>>2] = $36;
 $38 = ((($model)) + 1980|0);
 $39 = +HEAPF32[$38>>2];
 $40 = $39;
 $41 = 3.1415926540000001 / $40;
 $42 = (~~(($41)));
 $43 = ((($model)) + 1980|0);
 $44 = ((($43)) + 4|0);
 HEAP32[$44>>2] = $42;
 $45 = $2;
 $46 = $0;
 $47 = ((($46)) + 7324|0);
 $48 = HEAP32[$47>>2]|0;
 $49 = (_unpack_natural_or_gray($45,$nbit,3,$48)|0);
 $e_index = $49;
 $50 = $e_index;
 $51 = (+_decode_energy($50,3));
 $52 = ((($e)) + 12|0);
 HEAPF32[$52>>2] = $51;
 $i = 0;
 while(1) {
  $53 = $i;
  $54 = ($53|0)<(6);
  if (!($54)) {
   break;
  }
  $55 = $2;
  $56 = $i;
  $57 = (_mel_bits($56)|0);
  $58 = $0;
  $59 = ((($58)) + 7324|0);
  $60 = HEAP32[$59>>2]|0;
  $61 = (_unpack_natural_or_gray($55,$nbit,$57,$60)|0);
  $62 = $i;
  $63 = (($indexes) + ($62<<2)|0);
  HEAP32[$63>>2] = $61;
  $64 = $i;
  $65 = (($64) + 1)|0;
  $i = $65;
 }
 _decode_mels_scalar($mel,$indexes,6);
 $i = 0;
 while(1) {
  $66 = $i;
  $67 = ($66|0)<(6);
  if (!($67)) {
   break;
  }
  $68 = $i;
  $69 = (($mel) + ($68<<2)|0);
  $70 = +HEAPF32[$69>>2];
  $71 = $70;
  $72 = $71 / 2595.0;
  $73 = (+Math_pow(10.0,(+$72)));
  $74 = $73 - 1.0;
  $75 = 700.0 * $74;
  $76 = $75;
  $f_ = $76;
  $77 = $f_;
  $78 = $77;
  $79 = $78 * 7.8539816349999997E-4;
  $80 = $79;
  $81 = $i;
  $82 = ((($lsps)) + 72|0);
  $83 = (($82) + ($81<<2)|0);
  HEAPF32[$83>>2] = $80;
  $84 = $i;
  $85 = (($84) + 1)|0;
  $i = $85;
 }
 $86 = ((($lsps)) + 72|0);
 (_check_lsp_order($86,6)|0);
 $87 = ((($lsps)) + 72|0);
 _bw_expand_lsps($87,6,50.0,100.0);
 $i = 0;
 $weight = 0.25;
 while(1) {
  $88 = $i;
  $89 = ($88|0)<(3);
  if (!($89)) {
   break;
  }
  $90 = $i;
  $91 = (($lsps) + (($90*24)|0)|0);
  $92 = $0;
  $93 = ((($92)) + 8644|0);
  $94 = ((($lsps)) + 72|0);
  $95 = $weight;
  _interpolate_lsp_ver2($91,$93,$94,$95,6);
  $96 = $i;
  $97 = (($model) + (($96*660)|0)|0);
  $98 = $0;
  $99 = ((($98)) + 7984|0);
  $100 = ((($model)) + 1980|0);
  $101 = $weight;
  _interp_Wo2($97,$99,$100,$101);
  $102 = $0;
  $103 = ((($102)) + 8684|0);
  $104 = +HEAPF32[$103>>2];
  $105 = ((($e)) + 12|0);
  $106 = +HEAPF32[$105>>2];
  $107 = $weight;
  $108 = (+_interp_energy2($104,$106,$107));
  $109 = $i;
  $110 = (($e) + ($109<<2)|0);
  HEAPF32[$110>>2] = $108;
  $111 = $i;
  $112 = (($111) + 1)|0;
  $i = $112;
  $113 = $weight;
  $114 = $113;
  $115 = $114 + 0.25;
  $116 = $115;
  $weight = $116;
 }
 $i = 0;
 while(1) {
  $117 = $i;
  $118 = ($117|0)<(4);
  if (!($118)) {
   break;
  }
  $119 = $i;
  $120 = (($lsps) + (($119*24)|0)|0);
  $121 = $i;
  $122 = (($ak) + (($121*28)|0)|0);
  _lsp_to_lpc($120,$122,6);
  $123 = $0;
  $124 = ((($123)) + 8|0);
  $125 = HEAP32[$124>>2]|0;
  $126 = $i;
  $127 = (($ak) + (($126*28)|0)|0);
  $128 = $i;
  $129 = (($model) + (($128*660)|0)|0);
  $130 = $i;
  $131 = (($e) + ($130<<2)|0);
  $132 = +HEAPF32[$131>>2];
  $133 = $0;
  $134 = ((($133)) + 8688|0);
  $135 = HEAP32[$134>>2]|0;
  $136 = $0;
  $137 = ((($136)) + 8692|0);
  $138 = HEAP32[$137>>2]|0;
  $139 = $0;
  $140 = ((($139)) + 8696|0);
  $141 = +HEAPF32[$140>>2];
  $142 = $0;
  $143 = ((($142)) + 8700|0);
  $144 = +HEAPF32[$143>>2];
  _aks_to_M2($125,$127,6,$129,$132,$snr,0,0,$135,$138,$141,$144,$Aw);
  $145 = $i;
  $146 = (($model) + (($145*660)|0)|0);
  _apply_lpc_correction($146);
  $147 = $0;
  $148 = $i;
  $149 = ($148*80)|0;
  $150 = $1;
  $151 = (($150) + ($149<<1)|0);
  $152 = $i;
  $153 = (($model) + (($152*660)|0)|0);
  _synthesise_one_frame($147,$151,$153,$Aw);
  $154 = $i;
  $155 = (($154) + 1)|0;
  $i = $155;
 }
 $156 = $0;
 $157 = ((($156)) + 7984|0);
 $158 = ((($model)) + 1980|0);
 _memcpy(($157|0),($158|0),660)|0;
 $159 = ((($e)) + 12|0);
 $160 = +HEAPF32[$159>>2];
 $161 = $0;
 $162 = ((($161)) + 8684|0);
 HEAPF32[$162>>2] = $160;
 $i = 0;
 while(1) {
  $163 = $i;
  $164 = ($163|0)<(6);
  if (!($164)) {
   break;
  }
  $165 = $i;
  $166 = ((($lsps)) + 72|0);
  $167 = (($166) + ($165<<2)|0);
  $168 = +HEAPF32[$167>>2];
  $169 = $i;
  $170 = $0;
  $171 = ((($170)) + 8644|0);
  $172 = (($171) + ($169<<2)|0);
  HEAPF32[$172>>2] = $168;
  $173 = $i;
  $174 = (($173) + 1)|0;
  $i = $174;
 }
 STACKTOP = sp;return;
}
function _codec2_decode_700b($c2,$speech,$bits) {
 $c2 = $c2|0;
 $speech = $speech|0;
 $bits = $bits|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0.0, $101 = 0.0, $102 = 0.0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0.0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0.0, $122 = 0, $123 = 0, $124 = 0.0, $125 = 0, $126 = 0.0, $127 = 0.0, $128 = 0.0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0.0;
 var $134 = 0.0, $135 = 0.0, $136 = 0.0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0.0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0.0, $162 = 0, $163 = 0, $164 = 0.0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0.0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0.0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0;
 var $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0.0, $37 = 0, $38 = 0, $39 = 0.0, $4 = 0, $40 = 0.0, $41 = 0.0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $5 = 0, $50 = 0, $51 = 0.0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0;
 var $68 = 0, $69 = 0, $7 = 0, $70 = 0.0, $71 = 0, $72 = 0, $73 = 0, $74 = 0.0, $75 = 0.0, $76 = 0, $77 = 0, $78 = 0, $79 = 0.0, $8 = 0, $80 = 0.0, $81 = 0, $82 = 0, $83 = 0, $84 = 0.0, $85 = 0.0;
 var $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0.0, $93 = 0.0, $94 = 0.0, $95 = 0.0, $96 = 0.0, $97 = 0.0, $98 = 0.0, $99 = 0.0, $Aw = 0, $Wo_index = 0, $ak = 0, $e = 0, $e_index = 0;
 var $f_ = 0.0, $i = 0, $indexes = 0, $j = 0, $lsps = 0, $mel = 0, $model = 0, $nbit = 0, $snr = 0, $weight = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 7056|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $model = sp + 4392|0;
 $indexes = sp + 4376|0;
 $mel = sp + 4352|0;
 $lsps = sp + 4256|0;
 $e = sp + 4232|0;
 $snr = sp + 4228|0;
 $ak = sp + 4112|0;
 $nbit = sp + 4100|0;
 $Aw = sp;
 $0 = $c2;
 $1 = $speech;
 $2 = $bits;
 HEAP32[$nbit>>2] = 0;
 $3 = $0;
 $4 = ($3|0)!=(0|0);
 if (!($4)) {
  ___assert_fail((50542|0),(50512|0),1680,(50997|0));
  // unreachable;
 }
 $i = 0;
 while(1) {
  $5 = $i;
  $6 = ($5|0)<(4);
  if (!($6)) {
   break;
  }
  $j = 1;
  while(1) {
   $7 = $j;
   $8 = ($7|0)<=(80);
   if (!($8)) {
    break;
   }
   $9 = $j;
   $10 = $i;
   $11 = (($model) + (($10*660)|0)|0);
   $12 = ((($11)) + 8|0);
   $13 = (($12) + ($9<<2)|0);
   HEAPF32[$13>>2] = 0.0;
   $14 = $j;
   $15 = (($14) + 1)|0;
   $j = $15;
  }
  $16 = $i;
  $17 = (($16) + 1)|0;
  $i = $17;
 }
 $18 = $2;
 $19 = (_unpack($18,$nbit,1)|0);
 $20 = ((($model)) + 1980|0);
 $21 = ((($20)) + 656|0);
 HEAP32[$21>>2] = $19;
 $22 = ((($model)) + 1980|0);
 $23 = ((($22)) + 656|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ((($model)) + 1320|0);
 $26 = ((($25)) + 656|0);
 HEAP32[$26>>2] = $24;
 $27 = ((($model)) + 660|0);
 $28 = ((($27)) + 656|0);
 HEAP32[$28>>2] = $24;
 $29 = ((($model)) + 656|0);
 HEAP32[$29>>2] = $24;
 $30 = $2;
 $31 = $0;
 $32 = ((($31)) + 7324|0);
 $33 = HEAP32[$32>>2]|0;
 $34 = (_unpack_natural_or_gray($30,$nbit,5,$33)|0);
 $Wo_index = $34;
 $35 = $Wo_index;
 $36 = (+_decode_log_Wo($35,5));
 $37 = ((($model)) + 1980|0);
 HEAPF32[$37>>2] = $36;
 $38 = ((($model)) + 1980|0);
 $39 = +HEAPF32[$38>>2];
 $40 = $39;
 $41 = 3.1415926540000001 / $40;
 $42 = (~~(($41)));
 $43 = ((($model)) + 1980|0);
 $44 = ((($43)) + 4|0);
 HEAP32[$44>>2] = $42;
 $45 = $2;
 $46 = $0;
 $47 = ((($46)) + 7324|0);
 $48 = HEAP32[$47>>2]|0;
 $49 = (_unpack_natural_or_gray($45,$nbit,3,$48)|0);
 $e_index = $49;
 $50 = $e_index;
 $51 = (+_decode_energy($50,3));
 $52 = ((($e)) + 12|0);
 HEAPF32[$52>>2] = $51;
 $i = 0;
 while(1) {
  $53 = $i;
  $54 = ($53|0)<(3);
  if (!($54)) {
   break;
  }
  $55 = $2;
  $56 = $i;
  $57 = (_lspmelvq_cb_bits($56)|0);
  $58 = $0;
  $59 = ((($58)) + 7324|0);
  $60 = HEAP32[$59>>2]|0;
  $61 = (_unpack_natural_or_gray($55,$nbit,$57,$60)|0);
  $62 = $i;
  $63 = (($indexes) + ($62<<2)|0);
  HEAP32[$63>>2] = $61;
  $64 = $i;
  $65 = (($64) + 1)|0;
  $i = $65;
 }
 _lspmelvq_decode($indexes,$mel,6);
 $i = 1;
 while(1) {
  $66 = $i;
  $67 = ($66|0)<(6);
  if (!($67)) {
   break;
  }
  $68 = $i;
  $69 = (($mel) + ($68<<2)|0);
  $70 = +HEAPF32[$69>>2];
  $71 = $i;
  $72 = (($71) - 1)|0;
  $73 = (($mel) + ($72<<2)|0);
  $74 = +HEAPF32[$73>>2];
  $75 = $74 + 10.0;
  $76 = $70 <= $75;
  if ($76) {
   $77 = $i;
   $78 = (($mel) + ($77<<2)|0);
   $79 = +HEAPF32[$78>>2];
   $80 = $79 + 5.0;
   HEAPF32[$78>>2] = $80;
   $81 = $i;
   $82 = (($81) - 1)|0;
   $83 = (($mel) + ($82<<2)|0);
   $84 = +HEAPF32[$83>>2];
   $85 = $84 - 5.0;
   HEAPF32[$83>>2] = $85;
   $i = 1;
  }
  $86 = $i;
  $87 = (($86) + 1)|0;
  $i = $87;
 }
 $i = 0;
 while(1) {
  $88 = $i;
  $89 = ($88|0)<(6);
  if (!($89)) {
   break;
  }
  $90 = $i;
  $91 = (($mel) + ($90<<2)|0);
  $92 = +HEAPF32[$91>>2];
  $93 = $92;
  $94 = $93 / 2595.0;
  $95 = (+Math_pow(10.0,(+$94)));
  $96 = $95 - 1.0;
  $97 = 700.0 * $96;
  $98 = $97;
  $f_ = $98;
  $99 = $f_;
  $100 = $99;
  $101 = $100 * 7.8539816349999997E-4;
  $102 = $101;
  $103 = $i;
  $104 = ((($lsps)) + 72|0);
  $105 = (($104) + ($103<<2)|0);
  HEAPF32[$105>>2] = $102;
  $106 = $i;
  $107 = (($106) + 1)|0;
  $i = $107;
 }
 $i = 0;
 $weight = 0.25;
 while(1) {
  $108 = $i;
  $109 = ($108|0)<(3);
  if (!($109)) {
   break;
  }
  $110 = $i;
  $111 = (($lsps) + (($110*24)|0)|0);
  $112 = $0;
  $113 = ((($112)) + 8644|0);
  $114 = ((($lsps)) + 72|0);
  $115 = $weight;
  _interpolate_lsp_ver2($111,$113,$114,$115,6);
  $116 = $i;
  $117 = (($model) + (($116*660)|0)|0);
  $118 = $0;
  $119 = ((($118)) + 7984|0);
  $120 = ((($model)) + 1980|0);
  $121 = $weight;
  _interp_Wo2($117,$119,$120,$121);
  $122 = $0;
  $123 = ((($122)) + 8684|0);
  $124 = +HEAPF32[$123>>2];
  $125 = ((($e)) + 12|0);
  $126 = +HEAPF32[$125>>2];
  $127 = $weight;
  $128 = (+_interp_energy2($124,$126,$127));
  $129 = $i;
  $130 = (($e) + ($129<<2)|0);
  HEAPF32[$130>>2] = $128;
  $131 = $i;
  $132 = (($131) + 1)|0;
  $i = $132;
  $133 = $weight;
  $134 = $133;
  $135 = $134 + 0.25;
  $136 = $135;
  $weight = $136;
 }
 $i = 0;
 while(1) {
  $137 = $i;
  $138 = ($137|0)<(4);
  if (!($138)) {
   break;
  }
  $139 = $i;
  $140 = (($lsps) + (($139*24)|0)|0);
  $141 = $i;
  $142 = (($ak) + (($141*28)|0)|0);
  _lsp_to_lpc($140,$142,6);
  $143 = $0;
  $144 = ((($143)) + 8|0);
  $145 = HEAP32[$144>>2]|0;
  $146 = $i;
  $147 = (($ak) + (($146*28)|0)|0);
  $148 = $i;
  $149 = (($model) + (($148*660)|0)|0);
  $150 = $i;
  $151 = (($e) + ($150<<2)|0);
  $152 = +HEAPF32[$151>>2];
  $153 = $0;
  $154 = ((($153)) + 8688|0);
  $155 = HEAP32[$154>>2]|0;
  $156 = $0;
  $157 = ((($156)) + 8692|0);
  $158 = HEAP32[$157>>2]|0;
  $159 = $0;
  $160 = ((($159)) + 8696|0);
  $161 = +HEAPF32[$160>>2];
  $162 = $0;
  $163 = ((($162)) + 8700|0);
  $164 = +HEAPF32[$163>>2];
  _aks_to_M2($145,$147,6,$149,$152,$snr,0,0,$155,$158,$161,$164,$Aw);
  $165 = $i;
  $166 = (($model) + (($165*660)|0)|0);
  _apply_lpc_correction($166);
  $167 = $0;
  $168 = $i;
  $169 = ($168*80)|0;
  $170 = $1;
  $171 = (($170) + ($169<<1)|0);
  $172 = $i;
  $173 = (($model) + (($172*660)|0)|0);
  _synthesise_one_frame($167,$171,$173,$Aw);
  $174 = $i;
  $175 = (($174) + 1)|0;
  $i = $175;
 }
 $176 = $0;
 $177 = ((($176)) + 7984|0);
 $178 = ((($model)) + 1980|0);
 _memcpy(($177|0),($178|0),660)|0;
 $179 = ((($e)) + 12|0);
 $180 = +HEAPF32[$179>>2];
 $181 = $0;
 $182 = ((($181)) + 8684|0);
 HEAPF32[$182>>2] = $180;
 $i = 0;
 while(1) {
  $183 = $i;
  $184 = ($183|0)<(6);
  if (!($184)) {
   break;
  }
  $185 = $i;
  $186 = ((($lsps)) + 72|0);
  $187 = (($186) + ($185<<2)|0);
  $188 = +HEAPF32[$187>>2];
  $189 = $i;
  $190 = $0;
  $191 = ((($190)) + 8644|0);
  $192 = (($191) + ($189<<2)|0);
  HEAPF32[$192>>2] = $188;
  $193 = $i;
  $194 = (($193) + 1)|0;
  $i = $194;
 }
 STACKTOP = sp;return;
}
function _codec2_fft_free($cfg) {
 $cfg = $cfg|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $cfg;
 $1 = $0;
 _free($1);
 STACKTOP = sp;return;
}
function _codec2_fft_alloc($nfft,$inverse_fft,$mem,$lenmem) {
 $nfft = $nfft|0;
 $inverse_fft = $inverse_fft|0;
 $mem = $mem|0;
 $lenmem = $lenmem|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $retval = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $nfft;
 $1 = $inverse_fft;
 $2 = $mem;
 $3 = $lenmem;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = (_kiss_fft_alloc($4,$5,$6,$7)|0);
 $retval = $8;
 $9 = $retval;
 STACKTOP = sp;return ($9|0);
}
function _codec2_fftr_alloc($nfft,$inverse_fft,$mem,$lenmem) {
 $nfft = $nfft|0;
 $inverse_fft = $inverse_fft|0;
 $mem = $mem|0;
 $lenmem = $lenmem|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $retval = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $nfft;
 $1 = $inverse_fft;
 $2 = $mem;
 $3 = $lenmem;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = (_kiss_fftr_alloc($4,$5,$6,$7)|0);
 $retval = $8;
 $9 = $retval;
 STACKTOP = sp;return ($9|0);
}
function _codec2_fftr_free($cfg) {
 $cfg = $cfg|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $cfg;
 $1 = $0;
 _free($1);
 STACKTOP = sp;return;
}
function _interp_Wo($interp,$prev,$next) {
 $interp = $interp|0;
 $prev = $prev|0;
 $next = $next|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $interp;
 $1 = $prev;
 $2 = $next;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 _interp_Wo2($3,$4,$5,0.5);
 STACKTOP = sp;return;
}
function _interp_Wo2($interp,$prev,$next,$weight) {
 $interp = $interp|0;
 $prev = $prev|0;
 $next = $next|0;
 $weight = +$weight;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0.0, $30 = 0.0, $31 = 0.0, $32 = 0.0, $33 = 0, $34 = 0.0, $35 = 0.0, $36 = 0.0, $37 = 0.0, $38 = 0, $39 = 0.0, $4 = 0, $40 = 0.0, $41 = 0.0, $42 = 0.0, $43 = 0.0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0.0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0.0, $66 = 0, $67 = 0, $68 = 0, $69 = 0.0, $7 = 0, $70 = 0.0, $71 = 0.0, $72 = 0, $73 = 0, $74 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $interp;
 $1 = $prev;
 $2 = $next;
 $3 = $weight;
 $4 = $0;
 $5 = ((($4)) + 656|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)!=(0);
 if ($7) {
  $8 = $1;
  $9 = ((($8)) + 656|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)!=(0);
  if (!($11)) {
   $12 = $2;
   $13 = ((($12)) + 656|0);
   $14 = HEAP32[$13>>2]|0;
   $15 = ($14|0)!=(0);
   if (!($15)) {
    $16 = $0;
    $17 = ((($16)) + 656|0);
    HEAP32[$17>>2] = 0;
   }
  }
 }
 $18 = $0;
 $19 = ((($18)) + 656|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ($20|0)!=(0);
 if ($21) {
  $22 = $1;
  $23 = ((($22)) + 656|0);
  $24 = HEAP32[$23>>2]|0;
  $25 = ($24|0)!=(0);
  if ($25) {
   $26 = $2;
   $27 = ((($26)) + 656|0);
   $28 = HEAP32[$27>>2]|0;
   $29 = ($28|0)!=(0);
   if ($29) {
    $30 = $3;
    $31 = $30;
    $32 = 1.0 - $31;
    $33 = $1;
    $34 = +HEAPF32[$33>>2];
    $35 = $34;
    $36 = $32 * $35;
    $37 = $3;
    $38 = $2;
    $39 = +HEAPF32[$38>>2];
    $40 = $37 * $39;
    $41 = $40;
    $42 = $36 + $41;
    $43 = $42;
    $44 = $0;
    HEAPF32[$44>>2] = $43;
   }
  }
  $45 = $1;
  $46 = ((($45)) + 656|0);
  $47 = HEAP32[$46>>2]|0;
  $48 = ($47|0)!=(0);
  if (!($48)) {
   $49 = $2;
   $50 = ((($49)) + 656|0);
   $51 = HEAP32[$50>>2]|0;
   $52 = ($51|0)!=(0);
   if ($52) {
    $53 = $2;
    $54 = +HEAPF32[$53>>2];
    $55 = $0;
    HEAPF32[$55>>2] = $54;
   }
  }
  $56 = $1;
  $57 = ((($56)) + 656|0);
  $58 = HEAP32[$57>>2]|0;
  $59 = ($58|0)!=(0);
  if ($59) {
   $60 = $2;
   $61 = ((($60)) + 656|0);
   $62 = HEAP32[$61>>2]|0;
   $63 = ($62|0)!=(0);
   if (!($63)) {
    $64 = $1;
    $65 = +HEAPF32[$64>>2];
    $66 = $0;
    HEAPF32[$66>>2] = $65;
   }
  }
 } else {
  $67 = $0;
  HEAPF32[$67>>2] = 0.039269909262657166;
 }
 $68 = $0;
 $69 = +HEAPF32[$68>>2];
 $70 = $69;
 $71 = 3.1415926540000001 / $70;
 $72 = (~~(($71)));
 $73 = $0;
 $74 = ((($73)) + 4|0);
 HEAP32[$74>>2] = $72;
 STACKTOP = sp;return;
}
function _interp_energy($prev_e,$next_e) {
 $prev_e = +$prev_e;
 $next_e = +$next_e;
 var $0 = 0.0, $1 = 0.0, $2 = 0.0, $3 = 0.0, $4 = 0.0, $5 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $prev_e;
 $1 = $next_e;
 $2 = $0;
 $3 = $1;
 $4 = $2 * $3;
 $5 = (+Math_sqrt((+$4)));
 STACKTOP = sp;return (+$5);
}
function _interp_energy2($prev_e,$next_e,$weight) {
 $prev_e = +$prev_e;
 $next_e = +$next_e;
 $weight = +$weight;
 var $0 = 0.0, $1 = 0.0, $10 = 0.0, $11 = 0.0, $12 = 0.0, $13 = 0.0, $14 = 0.0, $15 = 0.0, $16 = 0.0, $17 = 0.0, $2 = 0.0, $3 = 0.0, $4 = 0.0, $5 = 0.0, $6 = 0.0, $7 = 0.0, $8 = 0.0, $9 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $prev_e;
 $1 = $next_e;
 $2 = $weight;
 $3 = $2;
 $4 = $3;
 $5 = 1.0 - $4;
 $6 = $0;
 $7 = (+_log10f($6));
 $8 = $7;
 $9 = $5 * $8;
 $10 = $2;
 $11 = $1;
 $12 = (+_log10f($11));
 $13 = $10 * $12;
 $14 = $13;
 $15 = $9 + $14;
 $16 = $15;
 $17 = (+Math_pow(10.0,(+$16)));
 STACKTOP = sp;return (+$17);
}
function _interpolate_lsp_ver2($interp,$prev,$next,$weight,$order) {
 $interp = $interp|0;
 $prev = $prev|0;
 $next = $next|0;
 $weight = +$weight;
 $order = $order|0;
 var $0 = 0, $1 = 0, $10 = 0.0, $11 = 0, $12 = 0, $13 = 0, $14 = 0.0, $15 = 0.0, $16 = 0.0, $17 = 0.0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0.0, $22 = 0.0, $23 = 0.0, $24 = 0.0, $25 = 0.0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0.0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $interp;
 $1 = $prev;
 $2 = $next;
 $3 = $weight;
 $4 = $order;
 $i = 0;
 while(1) {
  $5 = $i;
  $6 = $4;
  $7 = ($5|0)<($6|0);
  if (!($7)) {
   break;
  }
  $8 = $3;
  $9 = $8;
  $10 = 1.0 - $9;
  $11 = $i;
  $12 = $1;
  $13 = (($12) + ($11<<2)|0);
  $14 = +HEAPF32[$13>>2];
  $15 = $14;
  $16 = $10 * $15;
  $17 = $3;
  $18 = $i;
  $19 = $2;
  $20 = (($19) + ($18<<2)|0);
  $21 = +HEAPF32[$20>>2];
  $22 = $17 * $21;
  $23 = $22;
  $24 = $16 + $23;
  $25 = $24;
  $26 = $i;
  $27 = $0;
  $28 = (($27) + ($26<<2)|0);
  HEAPF32[$28>>2] = $25;
  $29 = $i;
  $30 = (($29) + 1)|0;
  $i = $30;
 }
 STACKTOP = sp;return;
}
function _kiss_fft_alloc($nfft,$inverse_fft,$mem,$lenmem) {
 $nfft = $nfft|0;
 $inverse_fft = $inverse_fft|0;
 $mem = $mem|0;
 $lenmem = $lenmem|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0.0, $33 = 0.0, $34 = 0, $35 = 0.0, $36 = 0.0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0.0, $42 = 0.0, $43 = 0.0, $44 = 0.0;
 var $45 = 0.0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0.0, $51 = 0.0, $52 = 0.0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $7 = 0, $8 = 0, $9 = 0, $i = 0, $memneeded = 0, $phase = 0.0, $pi = 0.0, $st = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $nfft;
 $1 = $inverse_fft;
 $2 = $mem;
 $3 = $lenmem;
 $st = 0;
 $4 = $0;
 $5 = (($4) - 1)|0;
 $6 = $5<<3;
 $7 = (272 + ($6))|0;
 $memneeded = $7;
 $8 = $3;
 $9 = ($8|0)==(0|0);
 if ($9) {
  $10 = $memneeded;
  $11 = (_malloc($10)|0);
  $st = $11;
 } else {
  $12 = $2;
  $13 = ($12|0)!=(0|0);
  if ($13) {
   $14 = $3;
   $15 = HEAP32[$14>>2]|0;
   $16 = $memneeded;
   $17 = ($15>>>0)>=($16>>>0);
   if ($17) {
    $18 = $2;
    $st = $18;
   }
  }
  $19 = $memneeded;
  $20 = $3;
  HEAP32[$20>>2] = $19;
 }
 $21 = $st;
 $22 = ($21|0)!=(0|0);
 if (!($22)) {
  $63 = $st;
  STACKTOP = sp;return ($63|0);
 }
 $23 = $0;
 $24 = $st;
 HEAP32[$24>>2] = $23;
 $25 = $1;
 $26 = $st;
 $27 = ((($26)) + 4|0);
 HEAP32[$27>>2] = $25;
 $i = 0;
 while(1) {
  $28 = $i;
  $29 = $0;
  $30 = ($28|0)<($29|0);
  if (!($30)) {
   break;
  }
  $pi = 3.1415926535897931;
  $31 = $i;
  $32 = (+($31|0));
  $33 = -6.2831853071795862 * $32;
  $34 = $0;
  $35 = (+($34|0));
  $36 = $33 / $35;
  $phase = $36;
  $37 = $st;
  $38 = ((($37)) + 4|0);
  $39 = HEAP32[$38>>2]|0;
  $40 = ($39|0)!=(0);
  if ($40) {
   $41 = $phase;
   $42 = $41 * -1.0;
   $phase = $42;
  }
  $43 = $phase;
  $44 = $43;
  $45 = (+Math_cos((+$44)));
  $46 = $st;
  $47 = ((($46)) + 264|0);
  $48 = $i;
  $49 = (($47) + ($48<<3)|0);
  HEAPF32[$49>>2] = $45;
  $50 = $phase;
  $51 = $50;
  $52 = (+Math_sin((+$51)));
  $53 = $st;
  $54 = ((($53)) + 264|0);
  $55 = $i;
  $56 = (($54) + ($55<<3)|0);
  $57 = ((($56)) + 4|0);
  HEAPF32[$57>>2] = $52;
  $58 = $i;
  $59 = (($58) + 1)|0;
  $i = $59;
 }
 $60 = $0;
 $61 = $st;
 $62 = ((($61)) + 8|0);
 _kf_factor($60,$62);
 $63 = $st;
 STACKTOP = sp;return ($63|0);
}
function _kf_factor($n,$facbuf) {
 $n = $n|0;
 $facbuf = $facbuf|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $17 = 0.0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0.0, $4 = 0.0, $5 = 0.0, $6 = 0.0, $7 = 0.0, $8 = 0, $9 = 0, $floor_sqrt = 0.0, $p = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $n;
 $1 = $facbuf;
 $p = 4;
 $2 = $0;
 $3 = (+($2|0));
 $4 = $3;
 $5 = (+Math_sqrt((+$4)));
 $6 = (+Math_floor((+$5)));
 $7 = $6;
 $floor_sqrt = $7;
 while(1) {
  $8 = $0;
  $9 = $p;
  $10 = (($8|0) % ($9|0))&-1;
  $11 = ($10|0)!=(0);
  $12 = $p;
  if (!($11)) {
   $20 = $0;
   $21 = (($20|0) / ($12|0))&-1;
   $0 = $21;
   $22 = $p;
   $23 = $1;
   $24 = ((($23)) + 4|0);
   $1 = $24;
   HEAP32[$23>>2] = $22;
   $25 = $0;
   $26 = $1;
   $27 = ((($26)) + 4|0);
   $1 = $27;
   HEAP32[$26>>2] = $25;
   $28 = $0;
   $29 = ($28|0)>(1);
   if ($29) {
    continue;
   } else {
    break;
   }
  }
  switch ($12|0) {
  case 4:  {
   $p = 2;
   break;
  }
  case 2:  {
   $p = 3;
   break;
  }
  default: {
   $13 = $p;
   $14 = (($13) + 2)|0;
   $p = $14;
  }
  }
  $15 = $p;
  $16 = (+($15|0));
  $17 = $floor_sqrt;
  $18 = $16 > $17;
  if (!($18)) {
   continue;
  }
  $19 = $0;
  $p = $19;
 }
 STACKTOP = sp;return;
}
function _kiss_fft_stride($st,$fin,$fout,$in_stride) {
 $st = $st|0;
 $fin = $fin|0;
 $fout = $fout|0;
 $in_stride = $in_stride|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $tmpbuf = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $st;
 $1 = $fin;
 $2 = $fout;
 $3 = $in_stride;
 $4 = $1;
 $5 = $2;
 $6 = ($4|0)==($5|0);
 if ($6) {
  $7 = $0;
  $8 = HEAP32[$7>>2]|0;
  $9 = $8<<3;
  $10 = (_malloc($9)|0);
  $tmpbuf = $10;
  $11 = $tmpbuf;
  $12 = $1;
  $13 = $3;
  $14 = $0;
  $15 = ((($14)) + 8|0);
  $16 = $0;
  _kf_work($11,$12,1,$13,$15,$16);
  $17 = $2;
  $18 = $tmpbuf;
  $19 = $0;
  $20 = HEAP32[$19>>2]|0;
  $21 = $20<<3;
  _memcpy(($17|0),($18|0),($21|0))|0;
  $22 = $tmpbuf;
  _free($22);
  STACKTOP = sp;return;
 } else {
  $23 = $2;
  $24 = $1;
  $25 = $3;
  $26 = $0;
  $27 = ((($26)) + 8|0);
  $28 = $0;
  _kf_work($23,$24,1,$25,$27,$28);
  STACKTOP = sp;return;
 }
}
function _kf_work($Fout,$f,$fstride,$in_stride,$factors,$st) {
 $Fout = $Fout|0;
 $f = $f|0;
 $fstride = $fstride|0;
 $in_stride = $in_stride|0;
 $factors = $factors|0;
 $st = $st|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $8 = 0, $9 = 0, $Fout_beg = 0, $Fout_end = 0, $m = 0, $p = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $Fout;
 $1 = $f;
 $2 = $fstride;
 $3 = $in_stride;
 $4 = $factors;
 $5 = $st;
 $6 = $0;
 $Fout_beg = $6;
 $7 = $4;
 $8 = ((($7)) + 4|0);
 $4 = $8;
 $9 = HEAP32[$7>>2]|0;
 $p = $9;
 $10 = $4;
 $11 = ((($10)) + 4|0);
 $4 = $11;
 $12 = HEAP32[$10>>2]|0;
 $m = $12;
 $13 = $0;
 $14 = $p;
 $15 = $m;
 $16 = Math_imul($14, $15)|0;
 $17 = (($13) + ($16<<3)|0);
 $Fout_end = $17;
 $18 = $m;
 $19 = ($18|0)==(1);
 if ($19) {
  while(1) {
   $20 = $0;
   $21 = $1;
   ;HEAP32[$20>>2]=HEAP32[$21>>2]|0;HEAP32[$20+4>>2]=HEAP32[$21+4>>2]|0;
   $22 = $2;
   $23 = $3;
   $24 = Math_imul($22, $23)|0;
   $25 = $1;
   $26 = (($25) + ($24<<3)|0);
   $1 = $26;
   $27 = $0;
   $28 = ((($27)) + 8|0);
   $0 = $28;
   $29 = $Fout_end;
   $30 = ($28|0)!=($29|0);
   if (!($30)) {
    break;
   }
  }
 } else {
  while(1) {
   $31 = $0;
   $32 = $1;
   $33 = $2;
   $34 = $p;
   $35 = Math_imul($33, $34)|0;
   $36 = $3;
   $37 = $4;
   $38 = $5;
   _kf_work($31,$32,$35,$36,$37,$38);
   $39 = $2;
   $40 = $3;
   $41 = Math_imul($39, $40)|0;
   $42 = $1;
   $43 = (($42) + ($41<<3)|0);
   $1 = $43;
   $44 = $m;
   $45 = $0;
   $46 = (($45) + ($44<<3)|0);
   $0 = $46;
   $47 = $Fout_end;
   $48 = ($46|0)!=($47|0);
   if (!($48)) {
    break;
   }
  }
 }
 $49 = $Fout_beg;
 $0 = $49;
 $50 = $p;
 switch ($50|0) {
 case 2:  {
  $51 = $0;
  $52 = $2;
  $53 = $5;
  $54 = $m;
  _kf_bfly2($51,$52,$53,$54);
  STACKTOP = sp;return;
  break;
 }
 case 3:  {
  $55 = $0;
  $56 = $2;
  $57 = $5;
  $58 = $m;
  _kf_bfly3($55,$56,$57,$58);
  STACKTOP = sp;return;
  break;
 }
 case 4:  {
  $59 = $0;
  $60 = $2;
  $61 = $5;
  $62 = $m;
  _kf_bfly4($59,$60,$61,$62);
  STACKTOP = sp;return;
  break;
 }
 case 5:  {
  $63 = $0;
  $64 = $2;
  $65 = $5;
  $66 = $m;
  _kf_bfly5($63,$64,$65,$66);
  STACKTOP = sp;return;
  break;
 }
 default: {
  $67 = $0;
  $68 = $2;
  $69 = $5;
  $70 = $m;
  $71 = $p;
  _kf_bfly_generic($67,$68,$69,$70,$71);
  STACKTOP = sp;return;
 }
 }
}
function _kf_bfly2($Fout,$fstride,$st,$m) {
 $Fout = $Fout|0;
 $fstride = $fstride|0;
 $st = $st|0;
 $m = $m|0;
 var $0 = 0, $1 = 0, $10 = 0.0, $11 = 0, $12 = 0.0, $13 = 0.0, $14 = 0, $15 = 0, $16 = 0.0, $17 = 0, $18 = 0, $19 = 0.0, $2 = 0, $20 = 0.0, $21 = 0.0, $22 = 0, $23 = 0.0, $24 = 0, $25 = 0, $26 = 0.0;
 var $27 = 0.0, $28 = 0, $29 = 0, $3 = 0, $30 = 0.0, $31 = 0, $32 = 0.0, $33 = 0.0, $34 = 0.0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0.0, $41 = 0.0, $42 = 0.0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0.0, $47 = 0, $48 = 0.0, $49 = 0.0, $5 = 0, $50 = 0, $51 = 0, $52 = 0.0, $53 = 0, $54 = 0.0, $55 = 0.0, $56 = 0, $57 = 0.0, $58 = 0, $59 = 0, $6 = 0, $60 = 0.0, $61 = 0.0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $7 = 0, $8 = 0, $9 = 0, $Fout2 = 0, $t = 0, $tw1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $t = sp;
 $0 = $Fout;
 $1 = $fstride;
 $2 = $st;
 $3 = $m;
 $4 = $2;
 $5 = ((($4)) + 264|0);
 $tw1 = $5;
 $6 = $0;
 $7 = $3;
 $8 = (($6) + ($7<<3)|0);
 $Fout2 = $8;
 while(1) {
  $9 = $Fout2;
  $10 = +HEAPF32[$9>>2];
  $11 = $tw1;
  $12 = +HEAPF32[$11>>2];
  $13 = $10 * $12;
  $14 = $Fout2;
  $15 = ((($14)) + 4|0);
  $16 = +HEAPF32[$15>>2];
  $17 = $tw1;
  $18 = ((($17)) + 4|0);
  $19 = +HEAPF32[$18>>2];
  $20 = $16 * $19;
  $21 = $13 - $20;
  HEAPF32[$t>>2] = $21;
  $22 = $Fout2;
  $23 = +HEAPF32[$22>>2];
  $24 = $tw1;
  $25 = ((($24)) + 4|0);
  $26 = +HEAPF32[$25>>2];
  $27 = $23 * $26;
  $28 = $Fout2;
  $29 = ((($28)) + 4|0);
  $30 = +HEAPF32[$29>>2];
  $31 = $tw1;
  $32 = +HEAPF32[$31>>2];
  $33 = $30 * $32;
  $34 = $27 + $33;
  $35 = ((($t)) + 4|0);
  HEAPF32[$35>>2] = $34;
  $36 = $1;
  $37 = $tw1;
  $38 = (($37) + ($36<<3)|0);
  $tw1 = $38;
  $39 = $0;
  $40 = +HEAPF32[$39>>2];
  $41 = +HEAPF32[$t>>2];
  $42 = $40 - $41;
  $43 = $Fout2;
  HEAPF32[$43>>2] = $42;
  $44 = $0;
  $45 = ((($44)) + 4|0);
  $46 = +HEAPF32[$45>>2];
  $47 = ((($t)) + 4|0);
  $48 = +HEAPF32[$47>>2];
  $49 = $46 - $48;
  $50 = $Fout2;
  $51 = ((($50)) + 4|0);
  HEAPF32[$51>>2] = $49;
  $52 = +HEAPF32[$t>>2];
  $53 = $0;
  $54 = +HEAPF32[$53>>2];
  $55 = $54 + $52;
  HEAPF32[$53>>2] = $55;
  $56 = ((($t)) + 4|0);
  $57 = +HEAPF32[$56>>2];
  $58 = $0;
  $59 = ((($58)) + 4|0);
  $60 = +HEAPF32[$59>>2];
  $61 = $60 + $57;
  HEAPF32[$59>>2] = $61;
  $62 = $Fout2;
  $63 = ((($62)) + 8|0);
  $Fout2 = $63;
  $64 = $0;
  $65 = ((($64)) + 8|0);
  $0 = $65;
  $66 = $3;
  $67 = (($66) + -1)|0;
  $3 = $67;
  $68 = ($67|0)!=(0);
  if (!($68)) {
   break;
  }
 }
 STACKTOP = sp;return;
}
function _kf_bfly3($Fout,$fstride,$st,$m) {
 $Fout = $Fout|0;
 $fstride = $fstride|0;
 $st = $st|0;
 $m = $m|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0.0, $101 = 0.0, $102 = 0, $103 = 0, $104 = 0, $105 = 0.0, $106 = 0, $107 = 0.0, $108 = 0.0, $109 = 0, $11 = 0, $110 = 0, $111 = 0.0, $112 = 0, $113 = 0, $114 = 0.0, $115 = 0.0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0.0, $126 = 0.0, $127 = 0, $128 = 0.0, $129 = 0.0, $13 = 0, $130 = 0.0, $131 = 0.0, $132 = 0.0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0.0, $139 = 0.0, $14 = 0, $140 = 0, $141 = 0, $142 = 0.0, $143 = 0.0, $144 = 0.0, $145 = 0.0, $146 = 0.0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0.0, $153 = 0.0, $154 = 0.0, $155 = 0, $156 = 0.0, $157 = 0, $158 = 0.0, $159 = 0.0, $16 = 0, $160 = 0, $161 = 0.0, $162 = 0, $163 = 0.0, $164 = 0.0, $165 = 0, $166 = 0, $167 = 0.0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0.0, $171 = 0.0, $172 = 0, $173 = 0, $174 = 0, $175 = 0.0, $176 = 0, $177 = 0.0, $178 = 0.0, $179 = 0, $18 = 0.0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0.0, $187 = 0.0, $188 = 0.0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0.0, $195 = 0, $196 = 0, $197 = 0, $198 = 0.0, $199 = 0.0, $2 = 0, $20 = 0.0, $200 = 0.0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0.0;
 var $206 = 0.0, $207 = 0, $208 = 0, $209 = 0, $21 = 0.0, $210 = 0, $211 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0.0, $27 = 0, $28 = 0, $29 = 0.0, $3 = 0, $30 = 0.0, $31 = 0.0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0.0, $37 = 0, $38 = 0, $39 = 0.0, $4 = 0, $40 = 0.0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0.0, $46 = 0, $47 = 0.0, $48 = 0.0, $49 = 0.0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0.0, $56 = 0, $57 = 0.0, $58 = 0.0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0.0, $64 = 0, $65 = 0, $66 = 0.0, $67 = 0.0, $68 = 0.0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0.0, $74 = 0, $75 = 0, $76 = 0.0, $77 = 0.0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0.0, $83 = 0, $84 = 0.0, $85 = 0.0, $86 = 0.0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0.0, $91 = 0, $92 = 0.0, $93 = 0.0, $94 = 0, $95 = 0, $96 = 0, $97 = 0.0, $98 = 0, $99 = 0, $epi3 = 0, $k = 0, $m2 = 0, $scratch = 0, $tw1 = 0, $tw2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $scratch = sp + 8|0;
 $epi3 = sp;
 $0 = $Fout;
 $1 = $fstride;
 $2 = $st;
 $3 = $m;
 $4 = $3;
 $k = $4;
 $5 = $3;
 $6 = $5<<1;
 $m2 = $6;
 $7 = $1;
 $8 = $3;
 $9 = Math_imul($7, $8)|0;
 $10 = $2;
 $11 = ((($10)) + 264|0);
 $12 = (($11) + ($9<<3)|0);
 ;HEAP32[$epi3>>2]=HEAP32[$12>>2]|0;HEAP32[$epi3+4>>2]=HEAP32[$12+4>>2]|0;
 $13 = $2;
 $14 = ((($13)) + 264|0);
 $tw2 = $14;
 $tw1 = $14;
 while(1) {
  $15 = $3;
  $16 = $0;
  $17 = (($16) + ($15<<3)|0);
  $18 = +HEAPF32[$17>>2];
  $19 = $tw1;
  $20 = +HEAPF32[$19>>2];
  $21 = $18 * $20;
  $22 = $3;
  $23 = $0;
  $24 = (($23) + ($22<<3)|0);
  $25 = ((($24)) + 4|0);
  $26 = +HEAPF32[$25>>2];
  $27 = $tw1;
  $28 = ((($27)) + 4|0);
  $29 = +HEAPF32[$28>>2];
  $30 = $26 * $29;
  $31 = $21 - $30;
  $32 = ((($scratch)) + 8|0);
  HEAPF32[$32>>2] = $31;
  $33 = $3;
  $34 = $0;
  $35 = (($34) + ($33<<3)|0);
  $36 = +HEAPF32[$35>>2];
  $37 = $tw1;
  $38 = ((($37)) + 4|0);
  $39 = +HEAPF32[$38>>2];
  $40 = $36 * $39;
  $41 = $3;
  $42 = $0;
  $43 = (($42) + ($41<<3)|0);
  $44 = ((($43)) + 4|0);
  $45 = +HEAPF32[$44>>2];
  $46 = $tw1;
  $47 = +HEAPF32[$46>>2];
  $48 = $45 * $47;
  $49 = $40 + $48;
  $50 = ((($scratch)) + 8|0);
  $51 = ((($50)) + 4|0);
  HEAPF32[$51>>2] = $49;
  $52 = $m2;
  $53 = $0;
  $54 = (($53) + ($52<<3)|0);
  $55 = +HEAPF32[$54>>2];
  $56 = $tw2;
  $57 = +HEAPF32[$56>>2];
  $58 = $55 * $57;
  $59 = $m2;
  $60 = $0;
  $61 = (($60) + ($59<<3)|0);
  $62 = ((($61)) + 4|0);
  $63 = +HEAPF32[$62>>2];
  $64 = $tw2;
  $65 = ((($64)) + 4|0);
  $66 = +HEAPF32[$65>>2];
  $67 = $63 * $66;
  $68 = $58 - $67;
  $69 = ((($scratch)) + 16|0);
  HEAPF32[$69>>2] = $68;
  $70 = $m2;
  $71 = $0;
  $72 = (($71) + ($70<<3)|0);
  $73 = +HEAPF32[$72>>2];
  $74 = $tw2;
  $75 = ((($74)) + 4|0);
  $76 = +HEAPF32[$75>>2];
  $77 = $73 * $76;
  $78 = $m2;
  $79 = $0;
  $80 = (($79) + ($78<<3)|0);
  $81 = ((($80)) + 4|0);
  $82 = +HEAPF32[$81>>2];
  $83 = $tw2;
  $84 = +HEAPF32[$83>>2];
  $85 = $82 * $84;
  $86 = $77 + $85;
  $87 = ((($scratch)) + 16|0);
  $88 = ((($87)) + 4|0);
  HEAPF32[$88>>2] = $86;
  $89 = ((($scratch)) + 8|0);
  $90 = +HEAPF32[$89>>2];
  $91 = ((($scratch)) + 16|0);
  $92 = +HEAPF32[$91>>2];
  $93 = $90 + $92;
  $94 = ((($scratch)) + 24|0);
  HEAPF32[$94>>2] = $93;
  $95 = ((($scratch)) + 8|0);
  $96 = ((($95)) + 4|0);
  $97 = +HEAPF32[$96>>2];
  $98 = ((($scratch)) + 16|0);
  $99 = ((($98)) + 4|0);
  $100 = +HEAPF32[$99>>2];
  $101 = $97 + $100;
  $102 = ((($scratch)) + 24|0);
  $103 = ((($102)) + 4|0);
  HEAPF32[$103>>2] = $101;
  $104 = ((($scratch)) + 8|0);
  $105 = +HEAPF32[$104>>2];
  $106 = ((($scratch)) + 16|0);
  $107 = +HEAPF32[$106>>2];
  $108 = $105 - $107;
  HEAPF32[$scratch>>2] = $108;
  $109 = ((($scratch)) + 8|0);
  $110 = ((($109)) + 4|0);
  $111 = +HEAPF32[$110>>2];
  $112 = ((($scratch)) + 16|0);
  $113 = ((($112)) + 4|0);
  $114 = +HEAPF32[$113>>2];
  $115 = $111 - $114;
  $116 = ((($scratch)) + 4|0);
  HEAPF32[$116>>2] = $115;
  $117 = $1;
  $118 = $tw1;
  $119 = (($118) + ($117<<3)|0);
  $tw1 = $119;
  $120 = $1;
  $121 = $120<<1;
  $122 = $tw2;
  $123 = (($122) + ($121<<3)|0);
  $tw2 = $123;
  $124 = $0;
  $125 = +HEAPF32[$124>>2];
  $126 = $125;
  $127 = ((($scratch)) + 24|0);
  $128 = +HEAPF32[$127>>2];
  $129 = $128;
  $130 = $129 * 0.5;
  $131 = $126 - $130;
  $132 = $131;
  $133 = $3;
  $134 = $0;
  $135 = (($134) + ($133<<3)|0);
  HEAPF32[$135>>2] = $132;
  $136 = $0;
  $137 = ((($136)) + 4|0);
  $138 = +HEAPF32[$137>>2];
  $139 = $138;
  $140 = ((($scratch)) + 24|0);
  $141 = ((($140)) + 4|0);
  $142 = +HEAPF32[$141>>2];
  $143 = $142;
  $144 = $143 * 0.5;
  $145 = $139 - $144;
  $146 = $145;
  $147 = $3;
  $148 = $0;
  $149 = (($148) + ($147<<3)|0);
  $150 = ((($149)) + 4|0);
  HEAPF32[$150>>2] = $146;
  $151 = ((($epi3)) + 4|0);
  $152 = +HEAPF32[$151>>2];
  $153 = +HEAPF32[$scratch>>2];
  $154 = $153 * $152;
  HEAPF32[$scratch>>2] = $154;
  $155 = ((($epi3)) + 4|0);
  $156 = +HEAPF32[$155>>2];
  $157 = ((($scratch)) + 4|0);
  $158 = +HEAPF32[$157>>2];
  $159 = $158 * $156;
  HEAPF32[$157>>2] = $159;
  $160 = ((($scratch)) + 24|0);
  $161 = +HEAPF32[$160>>2];
  $162 = $0;
  $163 = +HEAPF32[$162>>2];
  $164 = $163 + $161;
  HEAPF32[$162>>2] = $164;
  $165 = ((($scratch)) + 24|0);
  $166 = ((($165)) + 4|0);
  $167 = +HEAPF32[$166>>2];
  $168 = $0;
  $169 = ((($168)) + 4|0);
  $170 = +HEAPF32[$169>>2];
  $171 = $170 + $167;
  HEAPF32[$169>>2] = $171;
  $172 = $3;
  $173 = $0;
  $174 = (($173) + ($172<<3)|0);
  $175 = +HEAPF32[$174>>2];
  $176 = ((($scratch)) + 4|0);
  $177 = +HEAPF32[$176>>2];
  $178 = $175 + $177;
  $179 = $m2;
  $180 = $0;
  $181 = (($180) + ($179<<3)|0);
  HEAPF32[$181>>2] = $178;
  $182 = $3;
  $183 = $0;
  $184 = (($183) + ($182<<3)|0);
  $185 = ((($184)) + 4|0);
  $186 = +HEAPF32[$185>>2];
  $187 = +HEAPF32[$scratch>>2];
  $188 = $186 - $187;
  $189 = $m2;
  $190 = $0;
  $191 = (($190) + ($189<<3)|0);
  $192 = ((($191)) + 4|0);
  HEAPF32[$192>>2] = $188;
  $193 = ((($scratch)) + 4|0);
  $194 = +HEAPF32[$193>>2];
  $195 = $3;
  $196 = $0;
  $197 = (($196) + ($195<<3)|0);
  $198 = +HEAPF32[$197>>2];
  $199 = $198 - $194;
  HEAPF32[$197>>2] = $199;
  $200 = +HEAPF32[$scratch>>2];
  $201 = $3;
  $202 = $0;
  $203 = (($202) + ($201<<3)|0);
  $204 = ((($203)) + 4|0);
  $205 = +HEAPF32[$204>>2];
  $206 = $205 + $200;
  HEAPF32[$204>>2] = $206;
  $207 = $0;
  $208 = ((($207)) + 8|0);
  $0 = $208;
  $209 = $k;
  $210 = (($209) + -1)|0;
  $k = $210;
  $211 = ($210|0)!=(0);
  if (!($211)) {
   break;
  }
 }
 STACKTOP = sp;return;
}
function _kf_bfly4($Fout,$fstride,$st,$m) {
 $Fout = $Fout|0;
 $fstride = $fstride|0;
 $st = $st|0;
 $m = $m|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0.0, $105 = 0, $106 = 0, $107 = 0.0, $108 = 0.0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0.0, $114 = 0, $115 = 0.0;
 var $116 = 0.0, $117 = 0.0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0.0, $122 = 0, $123 = 0.0, $124 = 0.0, $125 = 0, $126 = 0, $127 = 0, $128 = 0.0, $129 = 0, $13 = 0, $130 = 0, $131 = 0.0, $132 = 0.0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0.0, $137 = 0, $138 = 0.0, $139 = 0.0, $14 = 0.0, $140 = 0, $141 = 0, $142 = 0.0, $143 = 0, $144 = 0, $145 = 0.0, $146 = 0.0, $147 = 0.0, $148 = 0, $149 = 0.0, $15 = 0, $150 = 0.0, $151 = 0;
 var $152 = 0, $153 = 0.0, $154 = 0, $155 = 0, $156 = 0.0, $157 = 0.0, $158 = 0, $159 = 0, $16 = 0.0, $160 = 0.0, $161 = 0, $162 = 0.0, $163 = 0.0, $164 = 0, $165 = 0, $166 = 0.0, $167 = 0, $168 = 0, $169 = 0.0, $17 = 0.0;
 var $170 = 0.0, $171 = 0, $172 = 0, $173 = 0, $174 = 0.0, $175 = 0, $176 = 0.0, $177 = 0.0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0.0, $184 = 0, $185 = 0, $186 = 0.0, $187 = 0.0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0.0, $205 = 0;
 var $206 = 0.0, $207 = 0.0, $208 = 0, $209 = 0, $21 = 0, $210 = 0.0, $211 = 0, $212 = 0, $213 = 0.0, $214 = 0.0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0.0, $220 = 0.0, $221 = 0, $222 = 0, $223 = 0.0;
 var $224 = 0.0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0.0, $231 = 0, $232 = 0.0, $233 = 0.0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0.0, $24 = 0, $240 = 0, $241 = 0;
 var $242 = 0.0, $243 = 0.0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0.0, $25 = 0.0, $250 = 0, $251 = 0.0, $252 = 0.0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0.0, $258 = 0, $259 = 0, $26 = 0.0;
 var $260 = 0, $261 = 0, $262 = 0, $263 = 0.0, $264 = 0, $265 = 0.0, $266 = 0.0, $267 = 0, $268 = 0, $269 = 0, $27 = 0.0, $270 = 0, $271 = 0, $272 = 0.0, $273 = 0, $274 = 0, $275 = 0.0, $276 = 0.0, $277 = 0, $278 = 0;
 var $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0.0, $283 = 0, $284 = 0.0, $285 = 0.0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $3 = 0, $30 = 0;
 var $31 = 0.0, $32 = 0, $33 = 0, $34 = 0.0, $35 = 0.0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0.0, $41 = 0, $42 = 0.0, $43 = 0.0, $44 = 0.0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0.0;
 var $5 = 0, $50 = 0, $51 = 0.0, $52 = 0.0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0.0, $58 = 0, $59 = 0, $6 = 0, $60 = 0.0, $61 = 0.0, $62 = 0.0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0.0;
 var $68 = 0, $69 = 0, $7 = 0, $70 = 0.0, $71 = 0.0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0.0, $77 = 0, $78 = 0.0, $79 = 0.0, $8 = 0, $80 = 0.0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0;
 var $86 = 0.0, $87 = 0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0.0, $95 = 0, $96 = 0, $97 = 0.0, $98 = 0.0, $99 = 0.0, $k = 0, $m2 = 0, $m3 = 0, $scratch = 0, $tw1 = 0;
 var $tw2 = 0, $tw3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $scratch = sp + 16|0;
 $0 = $Fout;
 $1 = $fstride;
 $2 = $st;
 $3 = $m;
 $4 = $3;
 $k = $4;
 $5 = $3;
 $6 = $5<<1;
 $m2 = $6;
 $7 = $3;
 $8 = ($7*3)|0;
 $m3 = $8;
 $9 = $2;
 $10 = ((($9)) + 264|0);
 $tw1 = $10;
 $tw2 = $10;
 $tw3 = $10;
 while(1) {
  $11 = $3;
  $12 = $0;
  $13 = (($12) + ($11<<3)|0);
  $14 = +HEAPF32[$13>>2];
  $15 = $tw1;
  $16 = +HEAPF32[$15>>2];
  $17 = $14 * $16;
  $18 = $3;
  $19 = $0;
  $20 = (($19) + ($18<<3)|0);
  $21 = ((($20)) + 4|0);
  $22 = +HEAPF32[$21>>2];
  $23 = $tw1;
  $24 = ((($23)) + 4|0);
  $25 = +HEAPF32[$24>>2];
  $26 = $22 * $25;
  $27 = $17 - $26;
  HEAPF32[$scratch>>2] = $27;
  $28 = $3;
  $29 = $0;
  $30 = (($29) + ($28<<3)|0);
  $31 = +HEAPF32[$30>>2];
  $32 = $tw1;
  $33 = ((($32)) + 4|0);
  $34 = +HEAPF32[$33>>2];
  $35 = $31 * $34;
  $36 = $3;
  $37 = $0;
  $38 = (($37) + ($36<<3)|0);
  $39 = ((($38)) + 4|0);
  $40 = +HEAPF32[$39>>2];
  $41 = $tw1;
  $42 = +HEAPF32[$41>>2];
  $43 = $40 * $42;
  $44 = $35 + $43;
  $45 = ((($scratch)) + 4|0);
  HEAPF32[$45>>2] = $44;
  $46 = $m2;
  $47 = $0;
  $48 = (($47) + ($46<<3)|0);
  $49 = +HEAPF32[$48>>2];
  $50 = $tw2;
  $51 = +HEAPF32[$50>>2];
  $52 = $49 * $51;
  $53 = $m2;
  $54 = $0;
  $55 = (($54) + ($53<<3)|0);
  $56 = ((($55)) + 4|0);
  $57 = +HEAPF32[$56>>2];
  $58 = $tw2;
  $59 = ((($58)) + 4|0);
  $60 = +HEAPF32[$59>>2];
  $61 = $57 * $60;
  $62 = $52 - $61;
  $63 = ((($scratch)) + 8|0);
  HEAPF32[$63>>2] = $62;
  $64 = $m2;
  $65 = $0;
  $66 = (($65) + ($64<<3)|0);
  $67 = +HEAPF32[$66>>2];
  $68 = $tw2;
  $69 = ((($68)) + 4|0);
  $70 = +HEAPF32[$69>>2];
  $71 = $67 * $70;
  $72 = $m2;
  $73 = $0;
  $74 = (($73) + ($72<<3)|0);
  $75 = ((($74)) + 4|0);
  $76 = +HEAPF32[$75>>2];
  $77 = $tw2;
  $78 = +HEAPF32[$77>>2];
  $79 = $76 * $78;
  $80 = $71 + $79;
  $81 = ((($scratch)) + 8|0);
  $82 = ((($81)) + 4|0);
  HEAPF32[$82>>2] = $80;
  $83 = $m3;
  $84 = $0;
  $85 = (($84) + ($83<<3)|0);
  $86 = +HEAPF32[$85>>2];
  $87 = $tw3;
  $88 = +HEAPF32[$87>>2];
  $89 = $86 * $88;
  $90 = $m3;
  $91 = $0;
  $92 = (($91) + ($90<<3)|0);
  $93 = ((($92)) + 4|0);
  $94 = +HEAPF32[$93>>2];
  $95 = $tw3;
  $96 = ((($95)) + 4|0);
  $97 = +HEAPF32[$96>>2];
  $98 = $94 * $97;
  $99 = $89 - $98;
  $100 = ((($scratch)) + 16|0);
  HEAPF32[$100>>2] = $99;
  $101 = $m3;
  $102 = $0;
  $103 = (($102) + ($101<<3)|0);
  $104 = +HEAPF32[$103>>2];
  $105 = $tw3;
  $106 = ((($105)) + 4|0);
  $107 = +HEAPF32[$106>>2];
  $108 = $104 * $107;
  $109 = $m3;
  $110 = $0;
  $111 = (($110) + ($109<<3)|0);
  $112 = ((($111)) + 4|0);
  $113 = +HEAPF32[$112>>2];
  $114 = $tw3;
  $115 = +HEAPF32[$114>>2];
  $116 = $113 * $115;
  $117 = $108 + $116;
  $118 = ((($scratch)) + 16|0);
  $119 = ((($118)) + 4|0);
  HEAPF32[$119>>2] = $117;
  $120 = $0;
  $121 = +HEAPF32[$120>>2];
  $122 = ((($scratch)) + 8|0);
  $123 = +HEAPF32[$122>>2];
  $124 = $121 - $123;
  $125 = ((($scratch)) + 40|0);
  HEAPF32[$125>>2] = $124;
  $126 = $0;
  $127 = ((($126)) + 4|0);
  $128 = +HEAPF32[$127>>2];
  $129 = ((($scratch)) + 8|0);
  $130 = ((($129)) + 4|0);
  $131 = +HEAPF32[$130>>2];
  $132 = $128 - $131;
  $133 = ((($scratch)) + 40|0);
  $134 = ((($133)) + 4|0);
  HEAPF32[$134>>2] = $132;
  $135 = ((($scratch)) + 8|0);
  $136 = +HEAPF32[$135>>2];
  $137 = $0;
  $138 = +HEAPF32[$137>>2];
  $139 = $138 + $136;
  HEAPF32[$137>>2] = $139;
  $140 = ((($scratch)) + 8|0);
  $141 = ((($140)) + 4|0);
  $142 = +HEAPF32[$141>>2];
  $143 = $0;
  $144 = ((($143)) + 4|0);
  $145 = +HEAPF32[$144>>2];
  $146 = $145 + $142;
  HEAPF32[$144>>2] = $146;
  $147 = +HEAPF32[$scratch>>2];
  $148 = ((($scratch)) + 16|0);
  $149 = +HEAPF32[$148>>2];
  $150 = $147 + $149;
  $151 = ((($scratch)) + 24|0);
  HEAPF32[$151>>2] = $150;
  $152 = ((($scratch)) + 4|0);
  $153 = +HEAPF32[$152>>2];
  $154 = ((($scratch)) + 16|0);
  $155 = ((($154)) + 4|0);
  $156 = +HEAPF32[$155>>2];
  $157 = $153 + $156;
  $158 = ((($scratch)) + 24|0);
  $159 = ((($158)) + 4|0);
  HEAPF32[$159>>2] = $157;
  $160 = +HEAPF32[$scratch>>2];
  $161 = ((($scratch)) + 16|0);
  $162 = +HEAPF32[$161>>2];
  $163 = $160 - $162;
  $164 = ((($scratch)) + 32|0);
  HEAPF32[$164>>2] = $163;
  $165 = ((($scratch)) + 4|0);
  $166 = +HEAPF32[$165>>2];
  $167 = ((($scratch)) + 16|0);
  $168 = ((($167)) + 4|0);
  $169 = +HEAPF32[$168>>2];
  $170 = $166 - $169;
  $171 = ((($scratch)) + 32|0);
  $172 = ((($171)) + 4|0);
  HEAPF32[$172>>2] = $170;
  $173 = $0;
  $174 = +HEAPF32[$173>>2];
  $175 = ((($scratch)) + 24|0);
  $176 = +HEAPF32[$175>>2];
  $177 = $174 - $176;
  $178 = $m2;
  $179 = $0;
  $180 = (($179) + ($178<<3)|0);
  HEAPF32[$180>>2] = $177;
  $181 = $0;
  $182 = ((($181)) + 4|0);
  $183 = +HEAPF32[$182>>2];
  $184 = ((($scratch)) + 24|0);
  $185 = ((($184)) + 4|0);
  $186 = +HEAPF32[$185>>2];
  $187 = $183 - $186;
  $188 = $m2;
  $189 = $0;
  $190 = (($189) + ($188<<3)|0);
  $191 = ((($190)) + 4|0);
  HEAPF32[$191>>2] = $187;
  $192 = $1;
  $193 = $tw1;
  $194 = (($193) + ($192<<3)|0);
  $tw1 = $194;
  $195 = $1;
  $196 = $195<<1;
  $197 = $tw2;
  $198 = (($197) + ($196<<3)|0);
  $tw2 = $198;
  $199 = $1;
  $200 = ($199*3)|0;
  $201 = $tw3;
  $202 = (($201) + ($200<<3)|0);
  $tw3 = $202;
  $203 = ((($scratch)) + 24|0);
  $204 = +HEAPF32[$203>>2];
  $205 = $0;
  $206 = +HEAPF32[$205>>2];
  $207 = $206 + $204;
  HEAPF32[$205>>2] = $207;
  $208 = ((($scratch)) + 24|0);
  $209 = ((($208)) + 4|0);
  $210 = +HEAPF32[$209>>2];
  $211 = $0;
  $212 = ((($211)) + 4|0);
  $213 = +HEAPF32[$212>>2];
  $214 = $213 + $210;
  HEAPF32[$212>>2] = $214;
  $215 = $2;
  $216 = ((($215)) + 4|0);
  $217 = HEAP32[$216>>2]|0;
  $218 = ($217|0)!=(0);
  $219 = ((($scratch)) + 40|0);
  $220 = +HEAPF32[$219>>2];
  $221 = ((($scratch)) + 32|0);
  $222 = ((($221)) + 4|0);
  $223 = +HEAPF32[$222>>2];
  if ($218) {
   $224 = $220 - $223;
   $225 = $3;
   $226 = $0;
   $227 = (($226) + ($225<<3)|0);
   HEAPF32[$227>>2] = $224;
   $228 = ((($scratch)) + 40|0);
   $229 = ((($228)) + 4|0);
   $230 = +HEAPF32[$229>>2];
   $231 = ((($scratch)) + 32|0);
   $232 = +HEAPF32[$231>>2];
   $233 = $230 + $232;
   $234 = $3;
   $235 = $0;
   $236 = (($235) + ($234<<3)|0);
   $237 = ((($236)) + 4|0);
   HEAPF32[$237>>2] = $233;
   $238 = ((($scratch)) + 40|0);
   $239 = +HEAPF32[$238>>2];
   $240 = ((($scratch)) + 32|0);
   $241 = ((($240)) + 4|0);
   $242 = +HEAPF32[$241>>2];
   $243 = $239 + $242;
   $244 = $m3;
   $245 = $0;
   $246 = (($245) + ($244<<3)|0);
   HEAPF32[$246>>2] = $243;
   $247 = ((($scratch)) + 40|0);
   $248 = ((($247)) + 4|0);
   $249 = +HEAPF32[$248>>2];
   $250 = ((($scratch)) + 32|0);
   $251 = +HEAPF32[$250>>2];
   $252 = $249 - $251;
   $253 = $m3;
   $254 = $0;
   $255 = (($254) + ($253<<3)|0);
   $256 = ((($255)) + 4|0);
   HEAPF32[$256>>2] = $252;
  } else {
   $257 = $220 + $223;
   $258 = $3;
   $259 = $0;
   $260 = (($259) + ($258<<3)|0);
   HEAPF32[$260>>2] = $257;
   $261 = ((($scratch)) + 40|0);
   $262 = ((($261)) + 4|0);
   $263 = +HEAPF32[$262>>2];
   $264 = ((($scratch)) + 32|0);
   $265 = +HEAPF32[$264>>2];
   $266 = $263 - $265;
   $267 = $3;
   $268 = $0;
   $269 = (($268) + ($267<<3)|0);
   $270 = ((($269)) + 4|0);
   HEAPF32[$270>>2] = $266;
   $271 = ((($scratch)) + 40|0);
   $272 = +HEAPF32[$271>>2];
   $273 = ((($scratch)) + 32|0);
   $274 = ((($273)) + 4|0);
   $275 = +HEAPF32[$274>>2];
   $276 = $272 - $275;
   $277 = $m3;
   $278 = $0;
   $279 = (($278) + ($277<<3)|0);
   HEAPF32[$279>>2] = $276;
   $280 = ((($scratch)) + 40|0);
   $281 = ((($280)) + 4|0);
   $282 = +HEAPF32[$281>>2];
   $283 = ((($scratch)) + 32|0);
   $284 = +HEAPF32[$283>>2];
   $285 = $282 + $284;
   $286 = $m3;
   $287 = $0;
   $288 = (($287) + ($286<<3)|0);
   $289 = ((($288)) + 4|0);
   HEAPF32[$289>>2] = $285;
  }
  $290 = $0;
  $291 = ((($290)) + 8|0);
  $0 = $291;
  $292 = $k;
  $293 = (($292) + -1)|0;
  $k = $293;
  $294 = ($293|0)!=(0);
  if (!($294)) {
   break;
  }
 }
 STACKTOP = sp;return;
}
function _kf_bfly5($Fout,$fstride,$st,$m) {
 $Fout = $Fout|0;
 $fstride = $fstride|0;
 $st = $st|0;
 $m = $m|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0.0, $105 = 0.0, $106 = 0.0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0.0, $118 = 0.0, $119 = 0, $12 = 0, $120 = 0, $121 = 0.0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0.0, $129 = 0.0, $13 = 0, $130 = 0.0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0.0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0.0, $142 = 0.0, $143 = 0, $144 = 0, $145 = 0.0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0.0, $154 = 0.0, $155 = 0.0, $156 = 0, $157 = 0, $158 = 0.0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0.0, $167 = 0.0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0.0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0.0, $178 = 0.0, $179 = 0.0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0.0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0.0, $191 = 0.0, $192 = 0, $193 = 0, $194 = 0.0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0.0, $203 = 0.0, $204 = 0.0, $205 = 0;
 var $206 = 0, $207 = 0.0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0.0, $216 = 0.0, $217 = 0, $218 = 0, $219 = 0.0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0;
 var $224 = 0, $225 = 0, $226 = 0.0, $227 = 0.0, $228 = 0.0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0.0, $233 = 0, $234 = 0.0, $235 = 0.0, $236 = 0, $237 = 0, $238 = 0, $239 = 0.0, $24 = 0, $240 = 0, $241 = 0;
 var $242 = 0.0, $243 = 0.0, $244 = 0, $245 = 0, $246 = 0, $247 = 0.0, $248 = 0, $249 = 0.0, $25 = 0, $250 = 0.0, $251 = 0, $252 = 0, $253 = 0, $254 = 0.0, $255 = 0, $256 = 0, $257 = 0.0, $258 = 0.0, $259 = 0, $26 = 0;
 var $260 = 0, $261 = 0, $262 = 0.0, $263 = 0, $264 = 0.0, $265 = 0.0, $266 = 0, $267 = 0, $268 = 0, $269 = 0.0, $27 = 0, $270 = 0, $271 = 0, $272 = 0.0, $273 = 0.0, $274 = 0, $275 = 0, $276 = 0, $277 = 0.0, $278 = 0;
 var $279 = 0.0, $28 = 0, $280 = 0.0, $281 = 0, $282 = 0, $283 = 0, $284 = 0.0, $285 = 0, $286 = 0, $287 = 0.0, $288 = 0.0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0.0, $293 = 0, $294 = 0.0, $295 = 0.0, $296 = 0;
 var $297 = 0.0, $298 = 0.0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0.0, $302 = 0, $303 = 0, $304 = 0.0, $305 = 0.0, $306 = 0, $307 = 0, $308 = 0.0, $309 = 0.0, $31 = 0, $310 = 0.0, $311 = 0, $312 = 0.0, $313 = 0.0;
 var $314 = 0.0, $315 = 0.0, $316 = 0, $317 = 0.0, $318 = 0.0, $319 = 0.0, $32 = 0, $320 = 0.0, $321 = 0, $322 = 0, $323 = 0.0, $324 = 0, $325 = 0, $326 = 0.0, $327 = 0.0, $328 = 0.0, $329 = 0.0, $33 = 0, $330 = 0, $331 = 0;
 var $332 = 0.0, $333 = 0.0, $334 = 0.0, $335 = 0.0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0.0, $341 = 0, $342 = 0.0, $343 = 0.0, $344 = 0, $345 = 0, $346 = 0.0, $347 = 0, $348 = 0.0, $349 = 0.0, $35 = 0;
 var $350 = 0.0, $351 = 0, $352 = 0, $353 = 0.0, $354 = 0, $355 = 0.0, $356 = 0.0, $357 = 0.0, $358 = 0, $359 = 0.0, $36 = 0, $360 = 0, $361 = 0.0, $362 = 0.0, $363 = 0.0, $364 = 0, $365 = 0, $366 = 0, $367 = 0.0, $368 = 0;
 var $369 = 0.0, $37 = 0, $370 = 0.0, $371 = 0, $372 = 0, $373 = 0, $374 = 0.0, $375 = 0, $376 = 0, $377 = 0.0, $378 = 0.0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0.0, $383 = 0, $384 = 0.0, $385 = 0.0, $386 = 0;
 var $387 = 0, $388 = 0, $389 = 0.0, $39 = 0, $390 = 0, $391 = 0, $392 = 0.0, $393 = 0.0, $394 = 0, $395 = 0, $396 = 0.0, $397 = 0, $398 = 0.0, $399 = 0.0, $4 = 0, $40 = 0.0, $400 = 0.0, $401 = 0.0, $402 = 0, $403 = 0.0;
 var $404 = 0.0, $405 = 0.0, $406 = 0.0, $407 = 0, $408 = 0, $409 = 0.0, $41 = 0, $410 = 0, $411 = 0, $412 = 0.0, $413 = 0.0, $414 = 0.0, $415 = 0.0, $416 = 0, $417 = 0, $418 = 0.0, $419 = 0.0, $42 = 0, $420 = 0.0, $421 = 0.0;
 var $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0.0, $427 = 0, $428 = 0.0, $429 = 0.0, $43 = 0, $430 = 0.0, $431 = 0, $432 = 0, $433 = 0.0, $434 = 0, $435 = 0.0, $436 = 0.0, $437 = 0.0, $438 = 0, $439 = 0, $44 = 0;
 var $440 = 0.0, $441 = 0, $442 = 0.0, $443 = 0.0, $444 = 0, $445 = 0.0, $446 = 0, $447 = 0.0, $448 = 0.0, $449 = 0.0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0.0, $454 = 0, $455 = 0.0, $456 = 0.0, $457 = 0, $458 = 0;
 var $459 = 0, $46 = 0.0, $460 = 0.0, $461 = 0, $462 = 0, $463 = 0.0, $464 = 0.0, $465 = 0, $466 = 0, $467 = 0, $468 = 0.0, $469 = 0, $47 = 0.0, $470 = 0.0, $471 = 0.0, $472 = 0, $473 = 0, $474 = 0, $475 = 0.0, $476 = 0;
 var $477 = 0, $478 = 0.0, $479 = 0.0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $5 = 0;
 var $50 = 0.0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0, $61 = 0, $62 = 0.0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0;
 var $69 = 0.0, $7 = 0, $70 = 0.0, $71 = 0, $72 = 0, $73 = 0.0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0.0, $8 = 0, $80 = 0.0, $81 = 0.0, $82 = 0, $83 = 0, $84 = 0, $85 = 0.0, $86 = 0;
 var $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0.0, $93 = 0.0, $94 = 0, $95 = 0, $96 = 0.0, $97 = 0, $98 = 0, $99 = 0, $Fout0 = 0, $Fout1 = 0, $Fout2 = 0, $Fout3 = 0, $Fout4 = 0, $scratch = 0;
 var $tw = 0, $twiddles = 0, $u = 0, $ya = 0, $yb = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 176|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $scratch = sp + 24|0;
 $ya = sp + 8|0;
 $yb = sp;
 $0 = $Fout;
 $1 = $fstride;
 $2 = $st;
 $3 = $m;
 $4 = $2;
 $5 = ((($4)) + 264|0);
 $twiddles = $5;
 $6 = $1;
 $7 = $3;
 $8 = Math_imul($6, $7)|0;
 $9 = $twiddles;
 $10 = (($9) + ($8<<3)|0);
 ;HEAP32[$ya>>2]=HEAP32[$10>>2]|0;HEAP32[$ya+4>>2]=HEAP32[$10+4>>2]|0;
 $11 = $1;
 $12 = $11<<1;
 $13 = $3;
 $14 = Math_imul($12, $13)|0;
 $15 = $twiddles;
 $16 = (($15) + ($14<<3)|0);
 ;HEAP32[$yb>>2]=HEAP32[$16>>2]|0;HEAP32[$yb+4>>2]=HEAP32[$16+4>>2]|0;
 $17 = $0;
 $Fout0 = $17;
 $18 = $Fout0;
 $19 = $3;
 $20 = (($18) + ($19<<3)|0);
 $Fout1 = $20;
 $21 = $Fout0;
 $22 = $3;
 $23 = $22<<1;
 $24 = (($21) + ($23<<3)|0);
 $Fout2 = $24;
 $25 = $Fout0;
 $26 = $3;
 $27 = ($26*3)|0;
 $28 = (($25) + ($27<<3)|0);
 $Fout3 = $28;
 $29 = $Fout0;
 $30 = $3;
 $31 = $30<<2;
 $32 = (($29) + ($31<<3)|0);
 $Fout4 = $32;
 $33 = $2;
 $34 = ((($33)) + 264|0);
 $tw = $34;
 $u = 0;
 while(1) {
  $35 = $u;
  $36 = $3;
  $37 = ($35|0)<($36|0);
  if (!($37)) {
   break;
  }
  $38 = $Fout0;
  ;HEAP32[$scratch>>2]=HEAP32[$38>>2]|0;HEAP32[$scratch+4>>2]=HEAP32[$38+4>>2]|0;
  $39 = $Fout1;
  $40 = +HEAPF32[$39>>2];
  $41 = $u;
  $42 = $1;
  $43 = Math_imul($41, $42)|0;
  $44 = $tw;
  $45 = (($44) + ($43<<3)|0);
  $46 = +HEAPF32[$45>>2];
  $47 = $40 * $46;
  $48 = $Fout1;
  $49 = ((($48)) + 4|0);
  $50 = +HEAPF32[$49>>2];
  $51 = $u;
  $52 = $1;
  $53 = Math_imul($51, $52)|0;
  $54 = $tw;
  $55 = (($54) + ($53<<3)|0);
  $56 = ((($55)) + 4|0);
  $57 = +HEAPF32[$56>>2];
  $58 = $50 * $57;
  $59 = $47 - $58;
  $60 = ((($scratch)) + 8|0);
  HEAPF32[$60>>2] = $59;
  $61 = $Fout1;
  $62 = +HEAPF32[$61>>2];
  $63 = $u;
  $64 = $1;
  $65 = Math_imul($63, $64)|0;
  $66 = $tw;
  $67 = (($66) + ($65<<3)|0);
  $68 = ((($67)) + 4|0);
  $69 = +HEAPF32[$68>>2];
  $70 = $62 * $69;
  $71 = $Fout1;
  $72 = ((($71)) + 4|0);
  $73 = +HEAPF32[$72>>2];
  $74 = $u;
  $75 = $1;
  $76 = Math_imul($74, $75)|0;
  $77 = $tw;
  $78 = (($77) + ($76<<3)|0);
  $79 = +HEAPF32[$78>>2];
  $80 = $73 * $79;
  $81 = $70 + $80;
  $82 = ((($scratch)) + 8|0);
  $83 = ((($82)) + 4|0);
  HEAPF32[$83>>2] = $81;
  $84 = $Fout2;
  $85 = +HEAPF32[$84>>2];
  $86 = $u;
  $87 = $86<<1;
  $88 = $1;
  $89 = Math_imul($87, $88)|0;
  $90 = $tw;
  $91 = (($90) + ($89<<3)|0);
  $92 = +HEAPF32[$91>>2];
  $93 = $85 * $92;
  $94 = $Fout2;
  $95 = ((($94)) + 4|0);
  $96 = +HEAPF32[$95>>2];
  $97 = $u;
  $98 = $97<<1;
  $99 = $1;
  $100 = Math_imul($98, $99)|0;
  $101 = $tw;
  $102 = (($101) + ($100<<3)|0);
  $103 = ((($102)) + 4|0);
  $104 = +HEAPF32[$103>>2];
  $105 = $96 * $104;
  $106 = $93 - $105;
  $107 = ((($scratch)) + 16|0);
  HEAPF32[$107>>2] = $106;
  $108 = $Fout2;
  $109 = +HEAPF32[$108>>2];
  $110 = $u;
  $111 = $110<<1;
  $112 = $1;
  $113 = Math_imul($111, $112)|0;
  $114 = $tw;
  $115 = (($114) + ($113<<3)|0);
  $116 = ((($115)) + 4|0);
  $117 = +HEAPF32[$116>>2];
  $118 = $109 * $117;
  $119 = $Fout2;
  $120 = ((($119)) + 4|0);
  $121 = +HEAPF32[$120>>2];
  $122 = $u;
  $123 = $122<<1;
  $124 = $1;
  $125 = Math_imul($123, $124)|0;
  $126 = $tw;
  $127 = (($126) + ($125<<3)|0);
  $128 = +HEAPF32[$127>>2];
  $129 = $121 * $128;
  $130 = $118 + $129;
  $131 = ((($scratch)) + 16|0);
  $132 = ((($131)) + 4|0);
  HEAPF32[$132>>2] = $130;
  $133 = $Fout3;
  $134 = +HEAPF32[$133>>2];
  $135 = $u;
  $136 = ($135*3)|0;
  $137 = $1;
  $138 = Math_imul($136, $137)|0;
  $139 = $tw;
  $140 = (($139) + ($138<<3)|0);
  $141 = +HEAPF32[$140>>2];
  $142 = $134 * $141;
  $143 = $Fout3;
  $144 = ((($143)) + 4|0);
  $145 = +HEAPF32[$144>>2];
  $146 = $u;
  $147 = ($146*3)|0;
  $148 = $1;
  $149 = Math_imul($147, $148)|0;
  $150 = $tw;
  $151 = (($150) + ($149<<3)|0);
  $152 = ((($151)) + 4|0);
  $153 = +HEAPF32[$152>>2];
  $154 = $145 * $153;
  $155 = $142 - $154;
  $156 = ((($scratch)) + 24|0);
  HEAPF32[$156>>2] = $155;
  $157 = $Fout3;
  $158 = +HEAPF32[$157>>2];
  $159 = $u;
  $160 = ($159*3)|0;
  $161 = $1;
  $162 = Math_imul($160, $161)|0;
  $163 = $tw;
  $164 = (($163) + ($162<<3)|0);
  $165 = ((($164)) + 4|0);
  $166 = +HEAPF32[$165>>2];
  $167 = $158 * $166;
  $168 = $Fout3;
  $169 = ((($168)) + 4|0);
  $170 = +HEAPF32[$169>>2];
  $171 = $u;
  $172 = ($171*3)|0;
  $173 = $1;
  $174 = Math_imul($172, $173)|0;
  $175 = $tw;
  $176 = (($175) + ($174<<3)|0);
  $177 = +HEAPF32[$176>>2];
  $178 = $170 * $177;
  $179 = $167 + $178;
  $180 = ((($scratch)) + 24|0);
  $181 = ((($180)) + 4|0);
  HEAPF32[$181>>2] = $179;
  $182 = $Fout4;
  $183 = +HEAPF32[$182>>2];
  $184 = $u;
  $185 = $184<<2;
  $186 = $1;
  $187 = Math_imul($185, $186)|0;
  $188 = $tw;
  $189 = (($188) + ($187<<3)|0);
  $190 = +HEAPF32[$189>>2];
  $191 = $183 * $190;
  $192 = $Fout4;
  $193 = ((($192)) + 4|0);
  $194 = +HEAPF32[$193>>2];
  $195 = $u;
  $196 = $195<<2;
  $197 = $1;
  $198 = Math_imul($196, $197)|0;
  $199 = $tw;
  $200 = (($199) + ($198<<3)|0);
  $201 = ((($200)) + 4|0);
  $202 = +HEAPF32[$201>>2];
  $203 = $194 * $202;
  $204 = $191 - $203;
  $205 = ((($scratch)) + 32|0);
  HEAPF32[$205>>2] = $204;
  $206 = $Fout4;
  $207 = +HEAPF32[$206>>2];
  $208 = $u;
  $209 = $208<<2;
  $210 = $1;
  $211 = Math_imul($209, $210)|0;
  $212 = $tw;
  $213 = (($212) + ($211<<3)|0);
  $214 = ((($213)) + 4|0);
  $215 = +HEAPF32[$214>>2];
  $216 = $207 * $215;
  $217 = $Fout4;
  $218 = ((($217)) + 4|0);
  $219 = +HEAPF32[$218>>2];
  $220 = $u;
  $221 = $220<<2;
  $222 = $1;
  $223 = Math_imul($221, $222)|0;
  $224 = $tw;
  $225 = (($224) + ($223<<3)|0);
  $226 = +HEAPF32[$225>>2];
  $227 = $219 * $226;
  $228 = $216 + $227;
  $229 = ((($scratch)) + 32|0);
  $230 = ((($229)) + 4|0);
  HEAPF32[$230>>2] = $228;
  $231 = ((($scratch)) + 8|0);
  $232 = +HEAPF32[$231>>2];
  $233 = ((($scratch)) + 32|0);
  $234 = +HEAPF32[$233>>2];
  $235 = $232 + $234;
  $236 = ((($scratch)) + 56|0);
  HEAPF32[$236>>2] = $235;
  $237 = ((($scratch)) + 8|0);
  $238 = ((($237)) + 4|0);
  $239 = +HEAPF32[$238>>2];
  $240 = ((($scratch)) + 32|0);
  $241 = ((($240)) + 4|0);
  $242 = +HEAPF32[$241>>2];
  $243 = $239 + $242;
  $244 = ((($scratch)) + 56|0);
  $245 = ((($244)) + 4|0);
  HEAPF32[$245>>2] = $243;
  $246 = ((($scratch)) + 8|0);
  $247 = +HEAPF32[$246>>2];
  $248 = ((($scratch)) + 32|0);
  $249 = +HEAPF32[$248>>2];
  $250 = $247 - $249;
  $251 = ((($scratch)) + 80|0);
  HEAPF32[$251>>2] = $250;
  $252 = ((($scratch)) + 8|0);
  $253 = ((($252)) + 4|0);
  $254 = +HEAPF32[$253>>2];
  $255 = ((($scratch)) + 32|0);
  $256 = ((($255)) + 4|0);
  $257 = +HEAPF32[$256>>2];
  $258 = $254 - $257;
  $259 = ((($scratch)) + 80|0);
  $260 = ((($259)) + 4|0);
  HEAPF32[$260>>2] = $258;
  $261 = ((($scratch)) + 16|0);
  $262 = +HEAPF32[$261>>2];
  $263 = ((($scratch)) + 24|0);
  $264 = +HEAPF32[$263>>2];
  $265 = $262 + $264;
  $266 = ((($scratch)) + 64|0);
  HEAPF32[$266>>2] = $265;
  $267 = ((($scratch)) + 16|0);
  $268 = ((($267)) + 4|0);
  $269 = +HEAPF32[$268>>2];
  $270 = ((($scratch)) + 24|0);
  $271 = ((($270)) + 4|0);
  $272 = +HEAPF32[$271>>2];
  $273 = $269 + $272;
  $274 = ((($scratch)) + 64|0);
  $275 = ((($274)) + 4|0);
  HEAPF32[$275>>2] = $273;
  $276 = ((($scratch)) + 16|0);
  $277 = +HEAPF32[$276>>2];
  $278 = ((($scratch)) + 24|0);
  $279 = +HEAPF32[$278>>2];
  $280 = $277 - $279;
  $281 = ((($scratch)) + 72|0);
  HEAPF32[$281>>2] = $280;
  $282 = ((($scratch)) + 16|0);
  $283 = ((($282)) + 4|0);
  $284 = +HEAPF32[$283>>2];
  $285 = ((($scratch)) + 24|0);
  $286 = ((($285)) + 4|0);
  $287 = +HEAPF32[$286>>2];
  $288 = $284 - $287;
  $289 = ((($scratch)) + 72|0);
  $290 = ((($289)) + 4|0);
  HEAPF32[$290>>2] = $288;
  $291 = ((($scratch)) + 56|0);
  $292 = +HEAPF32[$291>>2];
  $293 = ((($scratch)) + 64|0);
  $294 = +HEAPF32[$293>>2];
  $295 = $292 + $294;
  $296 = $Fout0;
  $297 = +HEAPF32[$296>>2];
  $298 = $297 + $295;
  HEAPF32[$296>>2] = $298;
  $299 = ((($scratch)) + 56|0);
  $300 = ((($299)) + 4|0);
  $301 = +HEAPF32[$300>>2];
  $302 = ((($scratch)) + 64|0);
  $303 = ((($302)) + 4|0);
  $304 = +HEAPF32[$303>>2];
  $305 = $301 + $304;
  $306 = $Fout0;
  $307 = ((($306)) + 4|0);
  $308 = +HEAPF32[$307>>2];
  $309 = $308 + $305;
  HEAPF32[$307>>2] = $309;
  $310 = +HEAPF32[$scratch>>2];
  $311 = ((($scratch)) + 56|0);
  $312 = +HEAPF32[$311>>2];
  $313 = +HEAPF32[$ya>>2];
  $314 = $312 * $313;
  $315 = $310 + $314;
  $316 = ((($scratch)) + 64|0);
  $317 = +HEAPF32[$316>>2];
  $318 = +HEAPF32[$yb>>2];
  $319 = $317 * $318;
  $320 = $315 + $319;
  $321 = ((($scratch)) + 40|0);
  HEAPF32[$321>>2] = $320;
  $322 = ((($scratch)) + 4|0);
  $323 = +HEAPF32[$322>>2];
  $324 = ((($scratch)) + 56|0);
  $325 = ((($324)) + 4|0);
  $326 = +HEAPF32[$325>>2];
  $327 = +HEAPF32[$ya>>2];
  $328 = $326 * $327;
  $329 = $323 + $328;
  $330 = ((($scratch)) + 64|0);
  $331 = ((($330)) + 4|0);
  $332 = +HEAPF32[$331>>2];
  $333 = +HEAPF32[$yb>>2];
  $334 = $332 * $333;
  $335 = $329 + $334;
  $336 = ((($scratch)) + 40|0);
  $337 = ((($336)) + 4|0);
  HEAPF32[$337>>2] = $335;
  $338 = ((($scratch)) + 80|0);
  $339 = ((($338)) + 4|0);
  $340 = +HEAPF32[$339>>2];
  $341 = ((($ya)) + 4|0);
  $342 = +HEAPF32[$341>>2];
  $343 = $340 * $342;
  $344 = ((($scratch)) + 72|0);
  $345 = ((($344)) + 4|0);
  $346 = +HEAPF32[$345>>2];
  $347 = ((($yb)) + 4|0);
  $348 = +HEAPF32[$347>>2];
  $349 = $346 * $348;
  $350 = $343 + $349;
  $351 = ((($scratch)) + 48|0);
  HEAPF32[$351>>2] = $350;
  $352 = ((($scratch)) + 80|0);
  $353 = +HEAPF32[$352>>2];
  $354 = ((($ya)) + 4|0);
  $355 = +HEAPF32[$354>>2];
  $356 = $353 * $355;
  $357 = -$356;
  $358 = ((($scratch)) + 72|0);
  $359 = +HEAPF32[$358>>2];
  $360 = ((($yb)) + 4|0);
  $361 = +HEAPF32[$360>>2];
  $362 = $359 * $361;
  $363 = $357 - $362;
  $364 = ((($scratch)) + 48|0);
  $365 = ((($364)) + 4|0);
  HEAPF32[$365>>2] = $363;
  $366 = ((($scratch)) + 40|0);
  $367 = +HEAPF32[$366>>2];
  $368 = ((($scratch)) + 48|0);
  $369 = +HEAPF32[$368>>2];
  $370 = $367 - $369;
  $371 = $Fout1;
  HEAPF32[$371>>2] = $370;
  $372 = ((($scratch)) + 40|0);
  $373 = ((($372)) + 4|0);
  $374 = +HEAPF32[$373>>2];
  $375 = ((($scratch)) + 48|0);
  $376 = ((($375)) + 4|0);
  $377 = +HEAPF32[$376>>2];
  $378 = $374 - $377;
  $379 = $Fout1;
  $380 = ((($379)) + 4|0);
  HEAPF32[$380>>2] = $378;
  $381 = ((($scratch)) + 40|0);
  $382 = +HEAPF32[$381>>2];
  $383 = ((($scratch)) + 48|0);
  $384 = +HEAPF32[$383>>2];
  $385 = $382 + $384;
  $386 = $Fout4;
  HEAPF32[$386>>2] = $385;
  $387 = ((($scratch)) + 40|0);
  $388 = ((($387)) + 4|0);
  $389 = +HEAPF32[$388>>2];
  $390 = ((($scratch)) + 48|0);
  $391 = ((($390)) + 4|0);
  $392 = +HEAPF32[$391>>2];
  $393 = $389 + $392;
  $394 = $Fout4;
  $395 = ((($394)) + 4|0);
  HEAPF32[$395>>2] = $393;
  $396 = +HEAPF32[$scratch>>2];
  $397 = ((($scratch)) + 56|0);
  $398 = +HEAPF32[$397>>2];
  $399 = +HEAPF32[$yb>>2];
  $400 = $398 * $399;
  $401 = $396 + $400;
  $402 = ((($scratch)) + 64|0);
  $403 = +HEAPF32[$402>>2];
  $404 = +HEAPF32[$ya>>2];
  $405 = $403 * $404;
  $406 = $401 + $405;
  $407 = ((($scratch)) + 88|0);
  HEAPF32[$407>>2] = $406;
  $408 = ((($scratch)) + 4|0);
  $409 = +HEAPF32[$408>>2];
  $410 = ((($scratch)) + 56|0);
  $411 = ((($410)) + 4|0);
  $412 = +HEAPF32[$411>>2];
  $413 = +HEAPF32[$yb>>2];
  $414 = $412 * $413;
  $415 = $409 + $414;
  $416 = ((($scratch)) + 64|0);
  $417 = ((($416)) + 4|0);
  $418 = +HEAPF32[$417>>2];
  $419 = +HEAPF32[$ya>>2];
  $420 = $418 * $419;
  $421 = $415 + $420;
  $422 = ((($scratch)) + 88|0);
  $423 = ((($422)) + 4|0);
  HEAPF32[$423>>2] = $421;
  $424 = ((($scratch)) + 80|0);
  $425 = ((($424)) + 4|0);
  $426 = +HEAPF32[$425>>2];
  $427 = ((($yb)) + 4|0);
  $428 = +HEAPF32[$427>>2];
  $429 = $426 * $428;
  $430 = -$429;
  $431 = ((($scratch)) + 72|0);
  $432 = ((($431)) + 4|0);
  $433 = +HEAPF32[$432>>2];
  $434 = ((($ya)) + 4|0);
  $435 = +HEAPF32[$434>>2];
  $436 = $433 * $435;
  $437 = $430 + $436;
  $438 = ((($scratch)) + 96|0);
  HEAPF32[$438>>2] = $437;
  $439 = ((($scratch)) + 80|0);
  $440 = +HEAPF32[$439>>2];
  $441 = ((($yb)) + 4|0);
  $442 = +HEAPF32[$441>>2];
  $443 = $440 * $442;
  $444 = ((($scratch)) + 72|0);
  $445 = +HEAPF32[$444>>2];
  $446 = ((($ya)) + 4|0);
  $447 = +HEAPF32[$446>>2];
  $448 = $445 * $447;
  $449 = $443 - $448;
  $450 = ((($scratch)) + 96|0);
  $451 = ((($450)) + 4|0);
  HEAPF32[$451>>2] = $449;
  $452 = ((($scratch)) + 88|0);
  $453 = +HEAPF32[$452>>2];
  $454 = ((($scratch)) + 96|0);
  $455 = +HEAPF32[$454>>2];
  $456 = $453 + $455;
  $457 = $Fout2;
  HEAPF32[$457>>2] = $456;
  $458 = ((($scratch)) + 88|0);
  $459 = ((($458)) + 4|0);
  $460 = +HEAPF32[$459>>2];
  $461 = ((($scratch)) + 96|0);
  $462 = ((($461)) + 4|0);
  $463 = +HEAPF32[$462>>2];
  $464 = $460 + $463;
  $465 = $Fout2;
  $466 = ((($465)) + 4|0);
  HEAPF32[$466>>2] = $464;
  $467 = ((($scratch)) + 88|0);
  $468 = +HEAPF32[$467>>2];
  $469 = ((($scratch)) + 96|0);
  $470 = +HEAPF32[$469>>2];
  $471 = $468 - $470;
  $472 = $Fout3;
  HEAPF32[$472>>2] = $471;
  $473 = ((($scratch)) + 88|0);
  $474 = ((($473)) + 4|0);
  $475 = +HEAPF32[$474>>2];
  $476 = ((($scratch)) + 96|0);
  $477 = ((($476)) + 4|0);
  $478 = +HEAPF32[$477>>2];
  $479 = $475 - $478;
  $480 = $Fout3;
  $481 = ((($480)) + 4|0);
  HEAPF32[$481>>2] = $479;
  $482 = $Fout0;
  $483 = ((($482)) + 8|0);
  $Fout0 = $483;
  $484 = $Fout1;
  $485 = ((($484)) + 8|0);
  $Fout1 = $485;
  $486 = $Fout2;
  $487 = ((($486)) + 8|0);
  $Fout2 = $487;
  $488 = $Fout3;
  $489 = ((($488)) + 8|0);
  $Fout3 = $489;
  $490 = $Fout4;
  $491 = ((($490)) + 8|0);
  $Fout4 = $491;
  $492 = $u;
  $493 = (($492) + 1)|0;
  $u = $493;
 }
 STACKTOP = sp;return;
}
function _kf_bfly_generic($Fout,$fstride,$st,$m,$p) {
 $Fout = $Fout|0;
 $fstride = $fstride|0;
 $st = $st|0;
 $m = $m|0;
 $p = $p|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0.0, $101 = 0, $102 = 0.0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0.0, $108 = 0.0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0.0, $56 = 0, $57 = 0, $58 = 0, $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0.0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0.0, $71 = 0.0, $72 = 0.0, $73 = 0, $74 = 0, $75 = 0, $76 = 0.0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0.0;
 var $82 = 0.0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0.0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0.0, $92 = 0.0, $93 = 0.0, $94 = 0, $95 = 0.0, $96 = 0, $97 = 0, $98 = 0, $99 = 0.0, $Norig = 0;
 var $k = 0, $q = 0, $q1 = 0, $scratch = 0, $t = 0, $twiddles = 0, $twidx = 0, $u = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $t = sp + 16|0;
 $0 = $Fout;
 $1 = $fstride;
 $2 = $st;
 $3 = $m;
 $4 = $p;
 $5 = $2;
 $6 = ((($5)) + 264|0);
 $twiddles = $6;
 $7 = $2;
 $8 = HEAP32[$7>>2]|0;
 $Norig = $8;
 $9 = $4;
 $10 = $9<<3;
 $11 = (_malloc($10)|0);
 $scratch = $11;
 $u = 0;
 while(1) {
  $12 = $u;
  $13 = $3;
  $14 = ($12|0)<($13|0);
  if (!($14)) {
   break;
  }
  $15 = $u;
  $k = $15;
  $q1 = 0;
  while(1) {
   $16 = $q1;
   $17 = $4;
   $18 = ($16|0)<($17|0);
   if (!($18)) {
    break;
   }
   $19 = $q1;
   $20 = $scratch;
   $21 = (($20) + ($19<<3)|0);
   $22 = $k;
   $23 = $0;
   $24 = (($23) + ($22<<3)|0);
   ;HEAP32[$21>>2]=HEAP32[$24>>2]|0;HEAP32[$21+4>>2]=HEAP32[$24+4>>2]|0;
   $25 = $3;
   $26 = $k;
   $27 = (($26) + ($25))|0;
   $k = $27;
   $28 = $q1;
   $29 = (($28) + 1)|0;
   $q1 = $29;
  }
  $30 = $u;
  $k = $30;
  $q1 = 0;
  while(1) {
   $31 = $q1;
   $32 = $4;
   $33 = ($31|0)<($32|0);
   if (!($33)) {
    break;
   }
   $twidx = 0;
   $34 = $k;
   $35 = $0;
   $36 = (($35) + ($34<<3)|0);
   $37 = $scratch;
   ;HEAP32[$36>>2]=HEAP32[$37>>2]|0;HEAP32[$36+4>>2]=HEAP32[$37+4>>2]|0;
   $q = 1;
   while(1) {
    $38 = $q;
    $39 = $4;
    $40 = ($38|0)<($39|0);
    if (!($40)) {
     break;
    }
    $41 = $1;
    $42 = $k;
    $43 = Math_imul($41, $42)|0;
    $44 = $twidx;
    $45 = (($44) + ($43))|0;
    $twidx = $45;
    $46 = $twidx;
    $47 = $Norig;
    $48 = ($46|0)>=($47|0);
    if ($48) {
     $49 = $Norig;
     $50 = $twidx;
     $51 = (($50) - ($49))|0;
     $twidx = $51;
    }
    $52 = $q;
    $53 = $scratch;
    $54 = (($53) + ($52<<3)|0);
    $55 = +HEAPF32[$54>>2];
    $56 = $twidx;
    $57 = $twiddles;
    $58 = (($57) + ($56<<3)|0);
    $59 = +HEAPF32[$58>>2];
    $60 = $55 * $59;
    $61 = $q;
    $62 = $scratch;
    $63 = (($62) + ($61<<3)|0);
    $64 = ((($63)) + 4|0);
    $65 = +HEAPF32[$64>>2];
    $66 = $twidx;
    $67 = $twiddles;
    $68 = (($67) + ($66<<3)|0);
    $69 = ((($68)) + 4|0);
    $70 = +HEAPF32[$69>>2];
    $71 = $65 * $70;
    $72 = $60 - $71;
    HEAPF32[$t>>2] = $72;
    $73 = $q;
    $74 = $scratch;
    $75 = (($74) + ($73<<3)|0);
    $76 = +HEAPF32[$75>>2];
    $77 = $twidx;
    $78 = $twiddles;
    $79 = (($78) + ($77<<3)|0);
    $80 = ((($79)) + 4|0);
    $81 = +HEAPF32[$80>>2];
    $82 = $76 * $81;
    $83 = $q;
    $84 = $scratch;
    $85 = (($84) + ($83<<3)|0);
    $86 = ((($85)) + 4|0);
    $87 = +HEAPF32[$86>>2];
    $88 = $twidx;
    $89 = $twiddles;
    $90 = (($89) + ($88<<3)|0);
    $91 = +HEAPF32[$90>>2];
    $92 = $87 * $91;
    $93 = $82 + $92;
    $94 = ((($t)) + 4|0);
    HEAPF32[$94>>2] = $93;
    $95 = +HEAPF32[$t>>2];
    $96 = $k;
    $97 = $0;
    $98 = (($97) + ($96<<3)|0);
    $99 = +HEAPF32[$98>>2];
    $100 = $99 + $95;
    HEAPF32[$98>>2] = $100;
    $101 = ((($t)) + 4|0);
    $102 = +HEAPF32[$101>>2];
    $103 = $k;
    $104 = $0;
    $105 = (($104) + ($103<<3)|0);
    $106 = ((($105)) + 4|0);
    $107 = +HEAPF32[$106>>2];
    $108 = $107 + $102;
    HEAPF32[$106>>2] = $108;
    $109 = $q;
    $110 = (($109) + 1)|0;
    $q = $110;
   }
   $111 = $3;
   $112 = $k;
   $113 = (($112) + ($111))|0;
   $k = $113;
   $114 = $q1;
   $115 = (($114) + 1)|0;
   $q1 = $115;
  }
  $116 = $u;
  $117 = (($116) + 1)|0;
  $u = $117;
 }
 $118 = $scratch;
 _free($118);
 STACKTOP = sp;return;
}
function _kiss_fft($cfg,$fin,$fout) {
 $cfg = $cfg|0;
 $fin = $fin|0;
 $fout = $fout|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $cfg;
 $1 = $fin;
 $2 = $fout;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 _kiss_fft_stride($3,$4,$5,1);
 STACKTOP = sp;return;
}
function _kiss_fftr_alloc($nfft,$inverse_fft,$mem,$lenmem) {
 $nfft = $nfft|0;
 $inverse_fft = $inverse_fft|0;
 $mem = $mem|0;
 $lenmem = $lenmem|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0.0, $6 = 0, $60 = 0, $61 = 0.0, $62 = 0.0;
 var $63 = 0.0, $64 = 0.0, $65 = 0, $66 = 0, $67 = 0.0, $68 = 0.0, $69 = 0.0, $7 = 0, $70 = 0.0, $71 = 0.0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0.0, $78 = 0.0, $79 = 0.0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $i = 0, $memneeded = 0, $phase = 0.0, $st = 0, $subsize = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp + 8|0;
 $subsize = sp + 16|0;
 $1 = $nfft;
 $2 = $inverse_fft;
 $3 = $mem;
 $4 = $lenmem;
 $st = 0;
 $5 = $1;
 $6 = $5 & 1;
 $7 = ($6|0)!=(0);
 if ($7) {
  $8 = HEAP32[12565]|0;
  (_fprintf($8,51016,$vararg_buffer)|0);
  $0 = 0;
  $89 = $0;
  STACKTOP = sp;return ($89|0);
 }
 $9 = $1;
 $10 = $9 >> 1;
 $1 = $10;
 $11 = $1;
 $12 = $2;
 (_kiss_fft_alloc($11,$12,0,$subsize)|0);
 $13 = HEAP32[$subsize>>2]|0;
 $14 = (12 + ($13))|0;
 $15 = $1;
 $16 = ($15*3)|0;
 $17 = (($16|0) / 2)&-1;
 $18 = $17<<3;
 $19 = (($14) + ($18))|0;
 $memneeded = $19;
 $20 = $4;
 $21 = ($20|0)==(0|0);
 if ($21) {
  $22 = $memneeded;
  $23 = (_malloc($22)|0);
  $st = $23;
 } else {
  $24 = $4;
  $25 = HEAP32[$24>>2]|0;
  $26 = $memneeded;
  $27 = ($25>>>0)>=($26>>>0);
  if ($27) {
   $28 = $3;
   $st = $28;
  }
  $29 = $memneeded;
  $30 = $4;
  HEAP32[$30>>2] = $29;
 }
 $31 = $st;
 $32 = ($31|0)!=(0|0);
 if (!($32)) {
  $0 = 0;
  $89 = $0;
  STACKTOP = sp;return ($89|0);
 }
 $33 = $st;
 $34 = ((($33)) + 12|0);
 $35 = $st;
 HEAP32[$35>>2] = $34;
 $36 = $st;
 $37 = HEAP32[$36>>2]|0;
 $38 = HEAP32[$subsize>>2]|0;
 $39 = (($37) + ($38)|0);
 $40 = $st;
 $41 = ((($40)) + 4|0);
 HEAP32[$41>>2] = $39;
 $42 = $st;
 $43 = ((($42)) + 4|0);
 $44 = HEAP32[$43>>2]|0;
 $45 = $1;
 $46 = (($44) + ($45<<3)|0);
 $47 = $st;
 $48 = ((($47)) + 8|0);
 HEAP32[$48>>2] = $46;
 $49 = $1;
 $50 = $2;
 $51 = $st;
 $52 = HEAP32[$51>>2]|0;
 (_kiss_fft_alloc($49,$50,$52,$subsize)|0);
 $i = 0;
 while(1) {
  $53 = $i;
  $54 = $1;
  $55 = (($54|0) / 2)&-1;
  $56 = ($53|0)<($55|0);
  if (!($56)) {
   break;
  }
  $57 = $i;
  $58 = (($57) + 1)|0;
  $59 = (+($58|0));
  $60 = $1;
  $61 = (+($60|0));
  $62 = $59 / $61;
  $63 = $62 + 0.5;
  $64 = -3.1415926535897931 * $63;
  $phase = $64;
  $65 = $2;
  $66 = ($65|0)!=(0);
  if ($66) {
   $67 = $phase;
   $68 = $67 * -1.0;
   $phase = $68;
  }
  $69 = $phase;
  $70 = $69;
  $71 = (+Math_cos((+$70)));
  $72 = $st;
  $73 = ((($72)) + 8|0);
  $74 = HEAP32[$73>>2]|0;
  $75 = $i;
  $76 = (($74) + ($75<<3)|0);
  HEAPF32[$76>>2] = $71;
  $77 = $phase;
  $78 = $77;
  $79 = (+Math_sin((+$78)));
  $80 = $st;
  $81 = ((($80)) + 8|0);
  $82 = HEAP32[$81>>2]|0;
  $83 = $i;
  $84 = (($82) + ($83<<3)|0);
  $85 = ((($84)) + 4|0);
  HEAPF32[$85>>2] = $79;
  $86 = $i;
  $87 = (($86) + 1)|0;
  $i = $87;
 }
 $88 = $st;
 $0 = $88;
 $89 = $0;
 STACKTOP = sp;return ($89|0);
}
function _kiss_fftr($st,$timedata,$freqdata) {
 $st = $st|0;
 $timedata = $timedata|0;
 $freqdata = $freqdata|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0.0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0.0, $111 = 0.0, $112 = 0.0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0.0, $121 = 0.0, $122 = 0, $123 = 0.0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0.0, $131 = 0.0, $132 = 0.0, $133 = 0;
 var $134 = 0.0, $135 = 0.0, $136 = 0.0, $137 = 0.0, $138 = 0.0, $139 = 0.0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0.0, $145 = 0, $146 = 0.0, $147 = 0.0, $148 = 0.0, $149 = 0.0, $15 = 0, $150 = 0.0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0.0, $156 = 0.0, $157 = 0.0, $158 = 0.0, $159 = 0.0, $16 = 0, $160 = 0.0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0.0, $168 = 0, $169 = 0.0, $17 = 0;
 var $170 = 0.0, $171 = 0.0, $172 = 0.0, $173 = 0.0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $19 = 0, $2 = 0, $20 = 0.0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0.0, $26 = 0, $27 = 0.0, $28 = 0, $29 = 0.0, $3 = 0, $30 = 0.0, $31 = 0, $32 = 0.0, $33 = 0, $34 = 0.0, $35 = 0.0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0.0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0.0, $71 = 0.0, $72 = 0, $73 = 0.0, $74 = 0.0, $75 = 0.0, $76 = 0, $77 = 0.0, $78 = 0, $79 = 0.0;
 var $8 = 0, $80 = 0.0, $81 = 0, $82 = 0.0, $83 = 0.0, $84 = 0.0, $85 = 0, $86 = 0.0, $87 = 0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0, $91 = 0.0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0.0, $99 = 0.0, $f1k = 0, $f2k = 0, $fpk = 0, $fpnk = 0, $k = 0, $ncfft = 0, $tdc = 0, $tw = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $fpnk = sp + 40|0;
 $fpk = sp + 32|0;
 $f1k = sp + 24|0;
 $f2k = sp + 16|0;
 $tw = sp + 8|0;
 $tdc = sp;
 $0 = $st;
 $1 = $timedata;
 $2 = $freqdata;
 $3 = $0;
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($4)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)==(0);
 if (!($7)) {
  ___assert_fail((51053|0),(51078|0),74,(51097|0));
  // unreachable;
 }
 $8 = $0;
 $9 = HEAP32[$8>>2]|0;
 $10 = HEAP32[$9>>2]|0;
 $ncfft = $10;
 $11 = $0;
 $12 = HEAP32[$11>>2]|0;
 $13 = $1;
 $14 = $0;
 $15 = ((($14)) + 4|0);
 $16 = HEAP32[$15>>2]|0;
 _kiss_fft($12,$13,$16);
 $17 = $0;
 $18 = ((($17)) + 4|0);
 $19 = HEAP32[$18>>2]|0;
 $20 = +HEAPF32[$19>>2];
 HEAPF32[$tdc>>2] = $20;
 $21 = $0;
 $22 = ((($21)) + 4|0);
 $23 = HEAP32[$22>>2]|0;
 $24 = ((($23)) + 4|0);
 $25 = +HEAPF32[$24>>2];
 $26 = ((($tdc)) + 4|0);
 HEAPF32[$26>>2] = $25;
 $27 = +HEAPF32[$tdc>>2];
 $28 = ((($tdc)) + 4|0);
 $29 = +HEAPF32[$28>>2];
 $30 = $27 + $29;
 $31 = $2;
 HEAPF32[$31>>2] = $30;
 $32 = +HEAPF32[$tdc>>2];
 $33 = ((($tdc)) + 4|0);
 $34 = +HEAPF32[$33>>2];
 $35 = $32 - $34;
 $36 = $ncfft;
 $37 = $2;
 $38 = (($37) + ($36<<3)|0);
 HEAPF32[$38>>2] = $35;
 $39 = $2;
 $40 = ((($39)) + 4|0);
 HEAPF32[$40>>2] = 0.0;
 $41 = $ncfft;
 $42 = $2;
 $43 = (($42) + ($41<<3)|0);
 $44 = ((($43)) + 4|0);
 HEAPF32[$44>>2] = 0.0;
 $k = 1;
 while(1) {
  $45 = $k;
  $46 = $ncfft;
  $47 = (($46|0) / 2)&-1;
  $48 = ($45|0)<=($47|0);
  if (!($48)) {
   break;
  }
  $49 = $k;
  $50 = $0;
  $51 = ((($50)) + 4|0);
  $52 = HEAP32[$51>>2]|0;
  $53 = (($52) + ($49<<3)|0);
  ;HEAP32[$fpk>>2]=HEAP32[$53>>2]|0;HEAP32[$fpk+4>>2]=HEAP32[$53+4>>2]|0;
  $54 = $ncfft;
  $55 = $k;
  $56 = (($54) - ($55))|0;
  $57 = $0;
  $58 = ((($57)) + 4|0);
  $59 = HEAP32[$58>>2]|0;
  $60 = (($59) + ($56<<3)|0);
  $61 = +HEAPF32[$60>>2];
  HEAPF32[$fpnk>>2] = $61;
  $62 = $ncfft;
  $63 = $k;
  $64 = (($62) - ($63))|0;
  $65 = $0;
  $66 = ((($65)) + 4|0);
  $67 = HEAP32[$66>>2]|0;
  $68 = (($67) + ($64<<3)|0);
  $69 = ((($68)) + 4|0);
  $70 = +HEAPF32[$69>>2];
  $71 = -$70;
  $72 = ((($fpnk)) + 4|0);
  HEAPF32[$72>>2] = $71;
  $73 = +HEAPF32[$fpk>>2];
  $74 = +HEAPF32[$fpnk>>2];
  $75 = $73 + $74;
  HEAPF32[$f1k>>2] = $75;
  $76 = ((($fpk)) + 4|0);
  $77 = +HEAPF32[$76>>2];
  $78 = ((($fpnk)) + 4|0);
  $79 = +HEAPF32[$78>>2];
  $80 = $77 + $79;
  $81 = ((($f1k)) + 4|0);
  HEAPF32[$81>>2] = $80;
  $82 = +HEAPF32[$fpk>>2];
  $83 = +HEAPF32[$fpnk>>2];
  $84 = $82 - $83;
  HEAPF32[$f2k>>2] = $84;
  $85 = ((($fpk)) + 4|0);
  $86 = +HEAPF32[$85>>2];
  $87 = ((($fpnk)) + 4|0);
  $88 = +HEAPF32[$87>>2];
  $89 = $86 - $88;
  $90 = ((($f2k)) + 4|0);
  HEAPF32[$90>>2] = $89;
  $91 = +HEAPF32[$f2k>>2];
  $92 = $k;
  $93 = (($92) - 1)|0;
  $94 = $0;
  $95 = ((($94)) + 8|0);
  $96 = HEAP32[$95>>2]|0;
  $97 = (($96) + ($93<<3)|0);
  $98 = +HEAPF32[$97>>2];
  $99 = $91 * $98;
  $100 = ((($f2k)) + 4|0);
  $101 = +HEAPF32[$100>>2];
  $102 = $k;
  $103 = (($102) - 1)|0;
  $104 = $0;
  $105 = ((($104)) + 8|0);
  $106 = HEAP32[$105>>2]|0;
  $107 = (($106) + ($103<<3)|0);
  $108 = ((($107)) + 4|0);
  $109 = +HEAPF32[$108>>2];
  $110 = $101 * $109;
  $111 = $99 - $110;
  HEAPF32[$tw>>2] = $111;
  $112 = +HEAPF32[$f2k>>2];
  $113 = $k;
  $114 = (($113) - 1)|0;
  $115 = $0;
  $116 = ((($115)) + 8|0);
  $117 = HEAP32[$116>>2]|0;
  $118 = (($117) + ($114<<3)|0);
  $119 = ((($118)) + 4|0);
  $120 = +HEAPF32[$119>>2];
  $121 = $112 * $120;
  $122 = ((($f2k)) + 4|0);
  $123 = +HEAPF32[$122>>2];
  $124 = $k;
  $125 = (($124) - 1)|0;
  $126 = $0;
  $127 = ((($126)) + 8|0);
  $128 = HEAP32[$127>>2]|0;
  $129 = (($128) + ($125<<3)|0);
  $130 = +HEAPF32[$129>>2];
  $131 = $123 * $130;
  $132 = $121 + $131;
  $133 = ((($tw)) + 4|0);
  HEAPF32[$133>>2] = $132;
  $134 = +HEAPF32[$f1k>>2];
  $135 = +HEAPF32[$tw>>2];
  $136 = $134 + $135;
  $137 = $136;
  $138 = $137 * 0.5;
  $139 = $138;
  $140 = $k;
  $141 = $2;
  $142 = (($141) + ($140<<3)|0);
  HEAPF32[$142>>2] = $139;
  $143 = ((($f1k)) + 4|0);
  $144 = +HEAPF32[$143>>2];
  $145 = ((($tw)) + 4|0);
  $146 = +HEAPF32[$145>>2];
  $147 = $144 + $146;
  $148 = $147;
  $149 = $148 * 0.5;
  $150 = $149;
  $151 = $k;
  $152 = $2;
  $153 = (($152) + ($151<<3)|0);
  $154 = ((($153)) + 4|0);
  HEAPF32[$154>>2] = $150;
  $155 = +HEAPF32[$f1k>>2];
  $156 = +HEAPF32[$tw>>2];
  $157 = $155 - $156;
  $158 = $157;
  $159 = $158 * 0.5;
  $160 = $159;
  $161 = $ncfft;
  $162 = $k;
  $163 = (($161) - ($162))|0;
  $164 = $2;
  $165 = (($164) + ($163<<3)|0);
  HEAPF32[$165>>2] = $160;
  $166 = ((($tw)) + 4|0);
  $167 = +HEAPF32[$166>>2];
  $168 = ((($f1k)) + 4|0);
  $169 = +HEAPF32[$168>>2];
  $170 = $167 - $169;
  $171 = $170;
  $172 = $171 * 0.5;
  $173 = $172;
  $174 = $ncfft;
  $175 = $k;
  $176 = (($174) - ($175))|0;
  $177 = $2;
  $178 = (($177) + ($176<<3)|0);
  $179 = ((($178)) + 4|0);
  HEAPF32[$179>>2] = $173;
  $180 = $k;
  $181 = (($180) + 1)|0;
  $k = $181;
 }
 STACKTOP = sp;return;
}
function _kiss_fftri($st,$freqdata,$timedata) {
 $st = $st|0;
 $freqdata = $freqdata|0;
 $timedata = $timedata|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0.0, $102 = 0.0, $103 = 0, $104 = 0.0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0.0, $112 = 0.0, $113 = 0.0, $114 = 0, $115 = 0.0;
 var $116 = 0.0, $117 = 0.0, $118 = 0, $119 = 0, $12 = 0.0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0.0, $125 = 0, $126 = 0.0, $127 = 0.0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0.0, $135 = 0.0, $136 = 0.0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0.0, $146 = 0, $147 = 0.0, $148 = 0.0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0.0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0.0, $166 = 0.0, $167 = 0, $168 = 0, $169 = 0, $17 = 0.0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0.0, $23 = 0, $24 = 0, $25 = 0, $26 = 0.0, $27 = 0.0, $28 = 0, $29 = 0, $3 = 0, $30 = 0;
 var $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0.0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $5 = 0, $50 = 0, $51 = 0.0, $52 = 0.0, $53 = 0, $54 = 0.0, $55 = 0.0, $56 = 0.0, $57 = 0, $58 = 0.0, $59 = 0, $6 = 0, $60 = 0.0, $61 = 0.0, $62 = 0, $63 = 0.0, $64 = 0.0, $65 = 0.0, $66 = 0, $67 = 0.0;
 var $68 = 0, $69 = 0.0, $7 = 0, $70 = 0.0, $71 = 0, $72 = 0.0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0.0, $8 = 0, $80 = 0.0, $81 = 0, $82 = 0.0, $83 = 0, $84 = 0, $85 = 0;
 var $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0.0, $91 = 0.0, $92 = 0.0, $93 = 0.0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $fek = 0, $fk = 0, $fnkc = 0, $fok = 0, $k = 0;
 var $ncfft = 0, $tmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $fk = sp + 32|0;
 $fnkc = sp + 24|0;
 $fek = sp + 16|0;
 $fok = sp + 8|0;
 $tmp = sp;
 $0 = $st;
 $1 = $freqdata;
 $2 = $timedata;
 $3 = $0;
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($4)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)==(1);
 if (!($7)) {
  ___assert_fail((51107|0),(51078|0),126,(51134|0));
  // unreachable;
 }
 $8 = $0;
 $9 = HEAP32[$8>>2]|0;
 $10 = HEAP32[$9>>2]|0;
 $ncfft = $10;
 $11 = $1;
 $12 = +HEAPF32[$11>>2];
 $13 = $ncfft;
 $14 = $1;
 $15 = (($14) + ($13<<3)|0);
 $16 = +HEAPF32[$15>>2];
 $17 = $12 + $16;
 $18 = $0;
 $19 = ((($18)) + 4|0);
 $20 = HEAP32[$19>>2]|0;
 HEAPF32[$20>>2] = $17;
 $21 = $1;
 $22 = +HEAPF32[$21>>2];
 $23 = $ncfft;
 $24 = $1;
 $25 = (($24) + ($23<<3)|0);
 $26 = +HEAPF32[$25>>2];
 $27 = $22 - $26;
 $28 = $0;
 $29 = ((($28)) + 4|0);
 $30 = HEAP32[$29>>2]|0;
 $31 = ((($30)) + 4|0);
 HEAPF32[$31>>2] = $27;
 $k = 1;
 while(1) {
  $32 = $k;
  $33 = $ncfft;
  $34 = (($33|0) / 2)&-1;
  $35 = ($32|0)<=($34|0);
  if (!($35)) {
   break;
  }
  $36 = $k;
  $37 = $1;
  $38 = (($37) + ($36<<3)|0);
  ;HEAP32[$fk>>2]=HEAP32[$38>>2]|0;HEAP32[$fk+4>>2]=HEAP32[$38+4>>2]|0;
  $39 = $ncfft;
  $40 = $k;
  $41 = (($39) - ($40))|0;
  $42 = $1;
  $43 = (($42) + ($41<<3)|0);
  $44 = +HEAPF32[$43>>2];
  HEAPF32[$fnkc>>2] = $44;
  $45 = $ncfft;
  $46 = $k;
  $47 = (($45) - ($46))|0;
  $48 = $1;
  $49 = (($48) + ($47<<3)|0);
  $50 = ((($49)) + 4|0);
  $51 = +HEAPF32[$50>>2];
  $52 = -$51;
  $53 = ((($fnkc)) + 4|0);
  HEAPF32[$53>>2] = $52;
  $54 = +HEAPF32[$fk>>2];
  $55 = +HEAPF32[$fnkc>>2];
  $56 = $54 + $55;
  HEAPF32[$fek>>2] = $56;
  $57 = ((($fk)) + 4|0);
  $58 = +HEAPF32[$57>>2];
  $59 = ((($fnkc)) + 4|0);
  $60 = +HEAPF32[$59>>2];
  $61 = $58 + $60;
  $62 = ((($fek)) + 4|0);
  HEAPF32[$62>>2] = $61;
  $63 = +HEAPF32[$fk>>2];
  $64 = +HEAPF32[$fnkc>>2];
  $65 = $63 - $64;
  HEAPF32[$tmp>>2] = $65;
  $66 = ((($fk)) + 4|0);
  $67 = +HEAPF32[$66>>2];
  $68 = ((($fnkc)) + 4|0);
  $69 = +HEAPF32[$68>>2];
  $70 = $67 - $69;
  $71 = ((($tmp)) + 4|0);
  HEAPF32[$71>>2] = $70;
  $72 = +HEAPF32[$tmp>>2];
  $73 = $k;
  $74 = (($73) - 1)|0;
  $75 = $0;
  $76 = ((($75)) + 8|0);
  $77 = HEAP32[$76>>2]|0;
  $78 = (($77) + ($74<<3)|0);
  $79 = +HEAPF32[$78>>2];
  $80 = $72 * $79;
  $81 = ((($tmp)) + 4|0);
  $82 = +HEAPF32[$81>>2];
  $83 = $k;
  $84 = (($83) - 1)|0;
  $85 = $0;
  $86 = ((($85)) + 8|0);
  $87 = HEAP32[$86>>2]|0;
  $88 = (($87) + ($84<<3)|0);
  $89 = ((($88)) + 4|0);
  $90 = +HEAPF32[$89>>2];
  $91 = $82 * $90;
  $92 = $80 - $91;
  HEAPF32[$fok>>2] = $92;
  $93 = +HEAPF32[$tmp>>2];
  $94 = $k;
  $95 = (($94) - 1)|0;
  $96 = $0;
  $97 = ((($96)) + 8|0);
  $98 = HEAP32[$97>>2]|0;
  $99 = (($98) + ($95<<3)|0);
  $100 = ((($99)) + 4|0);
  $101 = +HEAPF32[$100>>2];
  $102 = $93 * $101;
  $103 = ((($tmp)) + 4|0);
  $104 = +HEAPF32[$103>>2];
  $105 = $k;
  $106 = (($105) - 1)|0;
  $107 = $0;
  $108 = ((($107)) + 8|0);
  $109 = HEAP32[$108>>2]|0;
  $110 = (($109) + ($106<<3)|0);
  $111 = +HEAPF32[$110>>2];
  $112 = $104 * $111;
  $113 = $102 + $112;
  $114 = ((($fok)) + 4|0);
  HEAPF32[$114>>2] = $113;
  $115 = +HEAPF32[$fek>>2];
  $116 = +HEAPF32[$fok>>2];
  $117 = $115 + $116;
  $118 = $k;
  $119 = $0;
  $120 = ((($119)) + 4|0);
  $121 = HEAP32[$120>>2]|0;
  $122 = (($121) + ($118<<3)|0);
  HEAPF32[$122>>2] = $117;
  $123 = ((($fek)) + 4|0);
  $124 = +HEAPF32[$123>>2];
  $125 = ((($fok)) + 4|0);
  $126 = +HEAPF32[$125>>2];
  $127 = $124 + $126;
  $128 = $k;
  $129 = $0;
  $130 = ((($129)) + 4|0);
  $131 = HEAP32[$130>>2]|0;
  $132 = (($131) + ($128<<3)|0);
  $133 = ((($132)) + 4|0);
  HEAPF32[$133>>2] = $127;
  $134 = +HEAPF32[$fek>>2];
  $135 = +HEAPF32[$fok>>2];
  $136 = $134 - $135;
  $137 = $ncfft;
  $138 = $k;
  $139 = (($137) - ($138))|0;
  $140 = $0;
  $141 = ((($140)) + 4|0);
  $142 = HEAP32[$141>>2]|0;
  $143 = (($142) + ($139<<3)|0);
  HEAPF32[$143>>2] = $136;
  $144 = ((($fek)) + 4|0);
  $145 = +HEAPF32[$144>>2];
  $146 = ((($fok)) + 4|0);
  $147 = +HEAPF32[$146>>2];
  $148 = $145 - $147;
  $149 = $ncfft;
  $150 = $k;
  $151 = (($149) - ($150))|0;
  $152 = $0;
  $153 = ((($152)) + 4|0);
  $154 = HEAP32[$153>>2]|0;
  $155 = (($154) + ($151<<3)|0);
  $156 = ((($155)) + 4|0);
  HEAPF32[$156>>2] = $148;
  $157 = $ncfft;
  $158 = $k;
  $159 = (($157) - ($158))|0;
  $160 = $0;
  $161 = ((($160)) + 4|0);
  $162 = HEAP32[$161>>2]|0;
  $163 = (($162) + ($159<<3)|0);
  $164 = ((($163)) + 4|0);
  $165 = +HEAPF32[$164>>2];
  $166 = $165 * -1.0;
  HEAPF32[$164>>2] = $166;
  $167 = $k;
  $168 = (($167) + 1)|0;
  $k = $168;
 }
 $169 = $0;
 $170 = HEAP32[$169>>2]|0;
 $171 = $0;
 $172 = ((($171)) + 4|0);
 $173 = HEAP32[$172>>2]|0;
 $174 = $2;
 _kiss_fft($170,$173,$174);
 STACKTOP = sp;return;
}
function _unpack($bitArray,$bitIndex,$fieldWidth) {
 $bitArray = $bitArray|0;
 $bitIndex = $bitIndex|0;
 $fieldWidth = $fieldWidth|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $bitArray;
 $1 = $bitIndex;
 $2 = $fieldWidth;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = (_unpack_natural_or_gray($3,$4,$5,1)|0);
 STACKTOP = sp;return ($6|0);
}
function _unpack_natural_or_gray($bitArray,$bitIndex,$fieldWidth,$gray) {
 $bitArray = $bitArray|0;
 $bitIndex = $bitIndex|0;
 $fieldWidth = $fieldWidth|0;
 $gray = $gray|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $7 = 0, $8 = 0, $9 = 0, $bI = 0, $bitsLeft = 0, $field = 0, $sliceWidth = 0, $t = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $bitArray;
 $1 = $bitIndex;
 $2 = $fieldWidth;
 $3 = $gray;
 $field = 0;
 while(1) {
  $4 = $1;
  $5 = HEAP32[$4>>2]|0;
  $bI = $5;
  $6 = $bI;
  $7 = $6 & 7;
  $8 = (8 - ($7))|0;
  $bitsLeft = $8;
  $9 = $bitsLeft;
  $10 = $2;
  $11 = ($9>>>0)<($10>>>0);
  $12 = $bitsLeft;
  $13 = $2;
  $14 = $11 ? $12 : $13;
  $sliceWidth = $14;
  $15 = $bI;
  $16 = $15 >>> 3;
  $17 = $0;
  $18 = (($17) + ($16)|0);
  $19 = HEAP8[$18>>0]|0;
  $20 = $19&255;
  $21 = $bitsLeft;
  $22 = $sliceWidth;
  $23 = (($21) - ($22))|0;
  $24 = $20 >> $23;
  $25 = $sliceWidth;
  $26 = 1 << $25;
  $27 = (($26) - 1)|0;
  $28 = $24 & $27;
  $29 = $2;
  $30 = $sliceWidth;
  $31 = (($29) - ($30))|0;
  $32 = $28 << $31;
  $33 = $field;
  $34 = $33 | $32;
  $field = $34;
  $35 = $bI;
  $36 = $sliceWidth;
  $37 = (($35) + ($36))|0;
  $38 = $1;
  HEAP32[$38>>2] = $37;
  $39 = $sliceWidth;
  $40 = $2;
  $41 = (($40) - ($39))|0;
  $2 = $41;
  $42 = $2;
  $43 = ($42|0)!=(0);
  if (!($43)) {
   break;
  }
 }
 $44 = $3;
 $45 = ($44|0)!=(0);
 $46 = $field;
 if ($45) {
  $47 = $field;
  $48 = $47 >>> 8;
  $49 = $46 ^ $48;
  $t = $49;
  $50 = $t;
  $51 = $50 >>> 4;
  $52 = $t;
  $53 = $52 ^ $51;
  $t = $53;
  $54 = $t;
  $55 = $54 >>> 2;
  $56 = $t;
  $57 = $56 ^ $55;
  $t = $57;
  $58 = $t;
  $59 = $58 >>> 1;
  $60 = $t;
  $61 = $60 ^ $59;
  $t = $61;
  $62 = $t;
  STACKTOP = sp;return ($62|0);
 } else {
  $t = $46;
  $62 = $t;
  STACKTOP = sp;return ($62|0);
 }
 return (0)|0;
}
function _phase_synth_zero_order($fft_fwd_cfg,$model,$ex_phase,$A) {
 $fft_fwd_cfg = $fft_fwd_cfg|0;
 $model = $model|0;
 $ex_phase = $ex_phase|0;
 $A = $A|0;
 var $0 = 0, $1 = 0, $10 = 0.0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0.0, $105 = 0, $106 = 0, $107 = 0.0, $108 = 0.0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0.0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $117 = 0.0, $118 = 0.0, $119 = 0, $12 = 0.0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0.0, $125 = 0, $126 = 0, $127 = 0.0, $128 = 0.0, $129 = 0, $13 = 0.0, $130 = 0, $131 = 0.0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0.0, $136 = 0.0, $137 = 0.0, $138 = 0, $139 = 0, $14 = 0.0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0.0, $145 = 0, $146 = 0, $147 = 0.0, $148 = 0.0, $149 = 0.0, $15 = 0.0, $150 = 0.0, $151 = 0.0;
 var $152 = 0.0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $16 = 0.0, $17 = 0.0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0.0, $24 = 0, $25 = 0, $26 = 0, $27 = 0.0;
 var $28 = 0.0, $29 = 0.0, $3 = 0, $30 = 0.0, $31 = 0.0, $32 = 0, $33 = 0, $34 = 0.0, $35 = 0.0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0.0, $43 = 0.0, $44 = 0, $45 = 0.0;
 var $46 = 0.0, $47 = 0, $48 = 0.0, $49 = 0.0, $5 = 0, $50 = 0.0, $51 = 0.0, $52 = 0.0, $53 = 0.0, $54 = 0.0, $55 = 0.0, $56 = 0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0.0, $72 = 0, $73 = 0.0, $74 = 0.0, $75 = 0.0, $76 = 0, $77 = 0, $78 = 0, $79 = 0.0, $8 = 0, $80 = 0, $81 = 0.0;
 var $82 = 0.0, $83 = 0.0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0.0, $91 = 0.0, $92 = 0.0, $93 = 0.0, $94 = 0.0, $95 = 0, $96 = 0, $97 = 0.0, $98 = 0.0, $99 = 0, $A_ = 0;
 var $Ex = 0, $H = 0, $b = 0, $m = 0, $new_phi = 0.0, $phi = 0.0, $phi_ = 0.0, $r = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 2000|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $Ex = sp + 1304|0;
 $A_ = sp + 656|0;
 $H = sp + 8|0;
 $0 = $fft_fwd_cfg;
 $1 = $model;
 $2 = $ex_phase;
 $3 = $A;
 $r = 0.012271846644580364;
 $m = 1;
 while(1) {
  $4 = $m;
  $5 = $1;
  $6 = ((($5)) + 4|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = ($4|0)<=($7|0);
  if (!($8)) {
   break;
  }
  $9 = $m;
  $10 = (+($9|0));
  $11 = $1;
  $12 = +HEAPF32[$11>>2];
  $13 = $10 * $12;
  $14 = $r;
  $15 = $13 / $14;
  $16 = $15;
  $17 = $16 + 0.5;
  $18 = (~~(($17)));
  $b = $18;
  $19 = $b;
  $20 = $3;
  $21 = (($20) + ($19<<3)|0);
  $22 = ((($21)) + 4|0);
  $23 = +HEAPF32[$22>>2];
  $24 = $b;
  $25 = $3;
  $26 = (($25) + ($24<<3)|0);
  $27 = +HEAPF32[$26>>2];
  $28 = (+Math_atan2((+$23),(+$27)));
  $29 = -$28;
  $phi_ = $29;
  $30 = $phi_;
  $31 = (+Math_cos((+$30)));
  $32 = $m;
  $33 = (($H) + ($32<<3)|0);
  HEAPF32[$33>>2] = $31;
  $34 = $phi_;
  $35 = (+Math_sin((+$34)));
  $36 = $m;
  $37 = (($H) + ($36<<3)|0);
  $38 = ((($37)) + 4|0);
  HEAPF32[$38>>2] = $35;
  $39 = $m;
  $40 = (($39) + 1)|0;
  $m = $40;
 }
 $41 = $1;
 $42 = +HEAPF32[$41>>2];
 $43 = $42 * 80.0;
 $44 = $2;
 $45 = +HEAPF32[$44>>2];
 $46 = $45 + $43;
 HEAPF32[$44>>2] = $46;
 $47 = $2;
 $48 = +HEAPF32[$47>>2];
 $49 = $48;
 $50 = $49 / 6.2831853070000001;
 $51 = $50 + 0.5;
 $52 = $51;
 $53 = (+Math_floor((+$52)));
 $54 = $53;
 $55 = 6.2831853070000001 * $54;
 $56 = $2;
 $57 = +HEAPF32[$56>>2];
 $58 = $57;
 $59 = $58 - $55;
 $60 = $59;
 HEAPF32[$56>>2] = $60;
 $m = 1;
 while(1) {
  $61 = $m;
  $62 = $1;
  $63 = ((($62)) + 4|0);
  $64 = HEAP32[$63>>2]|0;
  $65 = ($61|0)<=($64|0);
  if (!($65)) {
   break;
  }
  $66 = $1;
  $67 = ((($66)) + 656|0);
  $68 = HEAP32[$67>>2]|0;
  $69 = ($68|0)!=(0);
  if ($69) {
   $70 = $2;
   $71 = +HEAPF32[$70>>2];
   $72 = $m;
   $73 = (+($72|0));
   $74 = $71 * $73;
   $75 = (+Math_cos((+$74)));
   $76 = $m;
   $77 = (($Ex) + ($76<<3)|0);
   HEAPF32[$77>>2] = $75;
   $78 = $2;
   $79 = +HEAPF32[$78>>2];
   $80 = $m;
   $81 = (+($80|0));
   $82 = $79 * $81;
   $83 = (+Math_sin((+$82)));
   $84 = $m;
   $85 = (($Ex) + ($84<<3)|0);
   $86 = ((($85)) + 4|0);
   HEAPF32[$86>>2] = $83;
  } else {
   $87 = (_codec2_rand()|0);
   $88 = (+($87|0));
   $89 = $88;
   $90 = 6.2831853070000001 * $89;
   $91 = $90 / 32767.0;
   $92 = $91;
   $phi = $92;
   $93 = $phi;
   $94 = (+Math_cos((+$93)));
   $95 = $m;
   $96 = (($Ex) + ($95<<3)|0);
   HEAPF32[$96>>2] = $94;
   $97 = $phi;
   $98 = (+Math_sin((+$97)));
   $99 = $m;
   $100 = (($Ex) + ($99<<3)|0);
   $101 = ((($100)) + 4|0);
   HEAPF32[$101>>2] = $98;
  }
  $102 = $m;
  $103 = (($H) + ($102<<3)|0);
  $104 = +HEAPF32[$103>>2];
  $105 = $m;
  $106 = (($Ex) + ($105<<3)|0);
  $107 = +HEAPF32[$106>>2];
  $108 = $104 * $107;
  $109 = $m;
  $110 = (($H) + ($109<<3)|0);
  $111 = ((($110)) + 4|0);
  $112 = +HEAPF32[$111>>2];
  $113 = $m;
  $114 = (($Ex) + ($113<<3)|0);
  $115 = ((($114)) + 4|0);
  $116 = +HEAPF32[$115>>2];
  $117 = $112 * $116;
  $118 = $108 - $117;
  $119 = $m;
  $120 = (($A_) + ($119<<3)|0);
  HEAPF32[$120>>2] = $118;
  $121 = $m;
  $122 = (($H) + ($121<<3)|0);
  $123 = ((($122)) + 4|0);
  $124 = +HEAPF32[$123>>2];
  $125 = $m;
  $126 = (($Ex) + ($125<<3)|0);
  $127 = +HEAPF32[$126>>2];
  $128 = $124 * $127;
  $129 = $m;
  $130 = (($H) + ($129<<3)|0);
  $131 = +HEAPF32[$130>>2];
  $132 = $m;
  $133 = (($Ex) + ($132<<3)|0);
  $134 = ((($133)) + 4|0);
  $135 = +HEAPF32[$134>>2];
  $136 = $131 * $135;
  $137 = $128 + $136;
  $138 = $m;
  $139 = (($A_) + ($138<<3)|0);
  $140 = ((($139)) + 4|0);
  HEAPF32[$140>>2] = $137;
  $141 = $m;
  $142 = (($A_) + ($141<<3)|0);
  $143 = ((($142)) + 4|0);
  $144 = +HEAPF32[$143>>2];
  $145 = $m;
  $146 = (($A_) + ($145<<3)|0);
  $147 = +HEAPF32[$146>>2];
  $148 = $147;
  $149 = $148 + 9.9999999999999998E-13;
  $150 = $149;
  $151 = (+Math_atan2((+$144),(+$150)));
  $new_phi = $151;
  $152 = $new_phi;
  $153 = $m;
  $154 = $1;
  $155 = ((($154)) + 332|0);
  $156 = (($155) + ($153<<2)|0);
  HEAPF32[$156>>2] = $152;
  $157 = $m;
  $158 = (($157) + 1)|0;
  $m = $158;
 }
 STACKTOP = sp;return;
}
function _postfilter($model,$bg_est) {
 $model = $model|0;
 $bg_est = $bg_est|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $17 = 0.0, $18 = 0.0, $19 = 0.0, $2 = 0, $20 = 0, $21 = 0, $22 = 0.0, $23 = 0.0, $24 = 0, $25 = 0.0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0.0, $3 = 0, $30 = 0.0, $31 = 0.0, $32 = 0.0, $33 = 0.0, $34 = 0.0, $35 = 0.0, $36 = 0.0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0.0, $44 = 0.0;
 var $45 = 0.0, $46 = 0.0, $47 = 0.0, $48 = 0.0, $49 = 0.0, $5 = 0, $50 = 0.0, $51 = 0, $52 = 0, $53 = 0.0, $54 = 0.0, $55 = 0.0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0.0, $73 = 0.0, $74 = 0, $75 = 0, $76 = 0.0, $77 = 0.0, $78 = 0.0, $79 = 0.0, $8 = 0, $80 = 0.0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $9 = 0, $e = 0.0, $m = 0, $thresh = 0.0, $uv = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $model;
 $1 = $bg_est;
 $e = 9.999999960041972E-13;
 $m = 1;
 while(1) {
  $2 = $m;
  $3 = $0;
  $4 = ((($3)) + 4|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = ($2|0)<=($5|0);
  if (!($6)) {
   break;
  }
  $7 = $m;
  $8 = $0;
  $9 = ((($8)) + 8|0);
  $10 = (($9) + ($7<<2)|0);
  $11 = +HEAPF32[$10>>2];
  $12 = $m;
  $13 = $0;
  $14 = ((($13)) + 8|0);
  $15 = (($14) + ($12<<2)|0);
  $16 = +HEAPF32[$15>>2];
  $17 = $11 * $16;
  $18 = $e;
  $19 = $18 + $17;
  $e = $19;
  $20 = $m;
  $21 = (($20) + 1)|0;
  $m = $21;
 }
 $22 = $e;
 $23 = $22;
 $24 = $23 > 0.0;
 if (!($24)) {
  ___assert_fail((51145|0),(51153|0),115,(51173|0));
  // unreachable;
 }
 $25 = $e;
 $26 = $0;
 $27 = ((($26)) + 4|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = (+($28|0));
 $30 = $25 / $29;
 $31 = (+_log10f($30));
 $32 = $31;
 $33 = 10.0 * $32;
 $34 = $33;
 $e = $34;
 $35 = $e;
 $36 = $35;
 $37 = $36 < 40.0;
 if ($37) {
  $38 = $0;
  $39 = ((($38)) + 656|0);
  $40 = HEAP32[$39>>2]|0;
  $41 = ($40|0)!=(0);
  if (!($41)) {
   $42 = $1;
   $43 = +HEAPF32[$42>>2];
   $44 = $43;
   $45 = $44 * 0.90000000000000002;
   $46 = $e;
   $47 = $46;
   $48 = $47 * 0.10000000000000001;
   $49 = $45 + $48;
   $50 = $49;
   $51 = $1;
   HEAPF32[$51>>2] = $50;
  }
 }
 $uv = 0;
 $52 = $1;
 $53 = +HEAPF32[$52>>2];
 $54 = $53;
 $55 = $54 + 6.0;
 $56 = $55 / 20.0;
 $57 = $56;
 $58 = (+Math_pow(10.0,(+$57)));
 $thresh = $58;
 $59 = $0;
 $60 = ((($59)) + 656|0);
 $61 = HEAP32[$60>>2]|0;
 $62 = ($61|0)!=(0);
 if (!($62)) {
  STACKTOP = sp;return;
 }
 $m = 1;
 while(1) {
  $63 = $m;
  $64 = $0;
  $65 = ((($64)) + 4|0);
  $66 = HEAP32[$65>>2]|0;
  $67 = ($63|0)<=($66|0);
  if (!($67)) {
   break;
  }
  $68 = $m;
  $69 = $0;
  $70 = ((($69)) + 8|0);
  $71 = (($70) + ($68<<2)|0);
  $72 = +HEAPF32[$71>>2];
  $73 = $thresh;
  $74 = $72 < $73;
  if ($74) {
   $75 = (_codec2_rand()|0);
   $76 = (+($75|0));
   $77 = $76;
   $78 = 6.2831853070000001 * $77;
   $79 = $78 / 32767.0;
   $80 = $79;
   $81 = $m;
   $82 = $0;
   $83 = ((($82)) + 332|0);
   $84 = (($83) + ($81<<2)|0);
   HEAPF32[$84>>2] = $80;
   $85 = $uv;
   $86 = (($85) + 1)|0;
   $uv = $86;
  }
  $87 = $m;
  $88 = (($87) + 1)|0;
  $m = $88;
 }
 STACKTOP = sp;return;
}
function _lsp_to_lpc($lsp,$ak,$order) {
 $lsp = $lsp|0;
 $ak = $ak|0;
 $order = $order|0;
 var $$alloca_mul = 0, $$alloca_mul5 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0.0, $101 = 0.0, $102 = 0.0, $103 = 0.0, $104 = 0.0, $105 = 0.0, $106 = 0.0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0.0, $111 = 0, $112 = 0, $113 = 0.0;
 var $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0.0, $18 = 0.0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0.0, $51 = 0, $52 = 0, $53 = 0, $54 = 0.0, $55 = 0.0, $56 = 0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0, $61 = 0.0;
 var $62 = 0.0, $63 = 0.0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0.0, $69 = 0.0, $7 = 0, $70 = 0, $71 = 0.0, $72 = 0.0, $73 = 0.0, $74 = 0, $75 = 0.0, $76 = 0.0, $77 = 0, $78 = 0.0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0.0, $82 = 0, $83 = 0.0, $84 = 0, $85 = 0.0, $86 = 0, $87 = 0.0, $88 = 0.0, $89 = 0, $9 = 0, $90 = 0, $91 = 0.0, $92 = 0, $93 = 0, $94 = 0.0, $95 = 0.0, $96 = 0.0, $97 = 0, $98 = 0;
 var $99 = 0.0, $i = 0, $j = 0, $n1 = 0, $n2 = 0, $n3 = 0, $n4 = 0, $pw = 0, $xin1 = 0.0, $xin2 = 0.0, $xout1 = 0.0, $xout2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $lsp;
 $1 = $ak;
 $2 = $order;
 $n4 = 0;
 $4 = $2;
 $5 = (_llvm_stacksave()|0);
 $3 = $5;
 $$alloca_mul = $4<<2;
 $6 = STACKTOP; STACKTOP = STACKTOP + ((((1*$$alloca_mul)|0)+15)&-16)|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();;
 $7 = $2;
 $8 = $7<<2;
 $9 = (($8) + 2)|0;
 $$alloca_mul5 = $9<<2;
 $10 = STACKTOP; STACKTOP = STACKTOP + ((((1*$$alloca_mul5)|0)+15)&-16)|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();;
 $i = 0;
 while(1) {
  $11 = $i;
  $12 = $2;
  $13 = ($11|0)<($12|0);
  if (!($13)) {
   break;
  }
  $14 = $i;
  $15 = $0;
  $16 = (($15) + ($14<<2)|0);
  $17 = +HEAPF32[$16>>2];
  $18 = (+Math_cos((+$17)));
  $19 = $i;
  $20 = (($6) + ($19<<2)|0);
  HEAPF32[$20>>2] = $18;
  $21 = $i;
  $22 = (($21) + 1)|0;
  $i = $22;
 }
 $pw = $10;
 $i = 0;
 while(1) {
  $23 = $i;
  $24 = $2;
  $25 = (($24|0) / 2)&-1;
  $26 = $25<<2;
  $27 = (($26) + 1)|0;
  $28 = ($23|0)<=($27|0);
  if (!($28)) {
   break;
  }
  $29 = $pw;
  $30 = ((($29)) + 4|0);
  $pw = $30;
  HEAPF32[$29>>2] = 0.0;
  $31 = $i;
  $32 = (($31) + 1)|0;
  $i = $32;
 }
 $pw = $10;
 $xin1 = 1.0;
 $xin2 = 1.0;
 $j = 0;
 while(1) {
  $33 = $j;
  $34 = $2;
  $35 = ($33|0)<=($34|0);
  if (!($35)) {
   break;
  }
  $i = 0;
  while(1) {
   $36 = $i;
   $37 = $2;
   $38 = (($37|0) / 2)&-1;
   $39 = ($36|0)<($38|0);
   if (!($39)) {
    break;
   }
   $40 = $pw;
   $41 = $i;
   $42 = $41<<2;
   $43 = (($40) + ($42<<2)|0);
   $n1 = $43;
   $44 = $n1;
   $45 = ((($44)) + 4|0);
   $n2 = $45;
   $46 = $n2;
   $47 = ((($46)) + 4|0);
   $n3 = $47;
   $48 = $n3;
   $49 = ((($48)) + 4|0);
   $n4 = $49;
   $50 = $xin1;
   $51 = $i;
   $52 = $51<<1;
   $53 = (($6) + ($52<<2)|0);
   $54 = +HEAPF32[$53>>2];
   $55 = 2.0 * $54;
   $56 = $n1;
   $57 = +HEAPF32[$56>>2];
   $58 = $55 * $57;
   $59 = $50 - $58;
   $60 = $n2;
   $61 = +HEAPF32[$60>>2];
   $62 = $59 + $61;
   $xout1 = $62;
   $63 = $xin2;
   $64 = $i;
   $65 = $64<<1;
   $66 = (($65) + 1)|0;
   $67 = (($6) + ($66<<2)|0);
   $68 = +HEAPF32[$67>>2];
   $69 = 2.0 * $68;
   $70 = $n3;
   $71 = +HEAPF32[$70>>2];
   $72 = $69 * $71;
   $73 = $63 - $72;
   $74 = $n4;
   $75 = +HEAPF32[$74>>2];
   $76 = $73 + $75;
   $xout2 = $76;
   $77 = $n1;
   $78 = +HEAPF32[$77>>2];
   $79 = $n2;
   HEAPF32[$79>>2] = $78;
   $80 = $n3;
   $81 = +HEAPF32[$80>>2];
   $82 = $n4;
   HEAPF32[$82>>2] = $81;
   $83 = $xin1;
   $84 = $n1;
   HEAPF32[$84>>2] = $83;
   $85 = $xin2;
   $86 = $n3;
   HEAPF32[$86>>2] = $85;
   $87 = $xout1;
   $xin1 = $87;
   $88 = $xout2;
   $xin2 = $88;
   $89 = $i;
   $90 = (($89) + 1)|0;
   $i = $90;
  }
  $91 = $xin1;
  $92 = $n4;
  $93 = ((($92)) + 4|0);
  $94 = +HEAPF32[$93>>2];
  $95 = $91 + $94;
  $xout1 = $95;
  $96 = $xin2;
  $97 = $n4;
  $98 = ((($97)) + 8|0);
  $99 = +HEAPF32[$98>>2];
  $100 = $96 - $99;
  $xout2 = $100;
  $101 = $xout1;
  $102 = $xout2;
  $103 = $101 + $102;
  $104 = $103;
  $105 = $104 * 0.5;
  $106 = $105;
  $107 = $j;
  $108 = $1;
  $109 = (($108) + ($107<<2)|0);
  HEAPF32[$109>>2] = $106;
  $110 = $xin1;
  $111 = $n4;
  $112 = ((($111)) + 4|0);
  HEAPF32[$112>>2] = $110;
  $113 = $xin2;
  $114 = $n4;
  $115 = ((($114)) + 8|0);
  HEAPF32[$115>>2] = $113;
  $xin1 = 0.0;
  $xin2 = 0.0;
  $116 = $j;
  $117 = (($116) + 1)|0;
  $j = $117;
 }
 $118 = $3;
 _llvm_stackrestore(($118|0));
 STACKTOP = sp;return;
}
function _nlp_create($m) {
 $m = $m|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0.0, $15 = 0.0, $16 = 0, $17 = 0, $18 = 0, $19 = 0.0, $2 = 0, $20 = 0.0, $21 = 0.0, $22 = 0.0, $23 = 0.0, $24 = 0.0, $25 = 0.0, $26 = 0.0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $i = 0, $nlp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $m;
 $2 = $1;
 $3 = ($2|0)<=(600);
 if (!($3)) {
  ___assert_fail((51184|0),(51196|0),150,(51209|0));
  // unreachable;
 }
 $4 = (_malloc(3088)|0);
 $nlp = $4;
 $5 = $nlp;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $0 = 0;
  $61 = $0;
  STACKTOP = sp;return ($61|0);
 }
 $7 = $1;
 $8 = $nlp;
 HEAP32[$8>>2] = $7;
 $i = 0;
 while(1) {
  $9 = $i;
  $10 = $1;
  $11 = (($10|0) / 5)&-1;
  $12 = ($9|0)<($11|0);
  if (!($12)) {
   break;
  }
  $13 = $i;
  $14 = (+($13|0));
  $15 = 6.2831853080000002 * $14;
  $16 = $1;
  $17 = (($16|0) / 5)&-1;
  $18 = (($17) - 1)|0;
  $19 = (+($18|0));
  $20 = $15 / $19;
  $21 = $20;
  $22 = (+Math_cos((+$21)));
  $23 = $22;
  $24 = 0.5 * $23;
  $25 = 0.5 - $24;
  $26 = $25;
  $27 = $i;
  $28 = $nlp;
  $29 = ((($28)) + 4|0);
  $30 = (($29) + ($27<<2)|0);
  HEAPF32[$30>>2] = $26;
  $31 = $i;
  $32 = (($31) + 1)|0;
  $i = $32;
 }
 $i = 0;
 while(1) {
  $33 = $i;
  $34 = ($33|0)<(600);
  if (!($34)) {
   break;
  }
  $35 = $i;
  $36 = $nlp;
  $37 = ((($36)) + 484|0);
  $38 = (($37) + ($35<<2)|0);
  HEAPF32[$38>>2] = 0.0;
  $39 = $i;
  $40 = (($39) + 1)|0;
  $i = $40;
 }
 $41 = $nlp;
 $42 = ((($41)) + 2884|0);
 HEAPF32[$42>>2] = 0.0;
 $43 = $nlp;
 $44 = ((($43)) + 2888|0);
 HEAPF32[$44>>2] = 0.0;
 $i = 0;
 while(1) {
  $45 = $i;
  $46 = ($45|0)<(48);
  if (!($46)) {
   break;
  }
  $47 = $i;
  $48 = $nlp;
  $49 = ((($48)) + 2892|0);
  $50 = (($49) + ($47<<2)|0);
  HEAPF32[$50>>2] = 0.0;
  $51 = $i;
  $52 = (($51) + 1)|0;
  $i = $52;
 }
 $53 = (_codec2_fft_alloc(512,0,0,0)|0);
 $54 = $nlp;
 $55 = ((($54)) + 3084|0);
 HEAP32[$55>>2] = $53;
 $56 = $nlp;
 $57 = ((($56)) + 3084|0);
 $58 = HEAP32[$57>>2]|0;
 $59 = ($58|0)!=(0|0);
 if (!($59)) {
  ___assert_fail((51220|0),(51196|0),169,(51209|0));
  // unreachable;
 }
 $60 = $nlp;
 $0 = $60;
 $61 = $0;
 STACKTOP = sp;return ($61|0);
}
function _nlp_destroy($nlp_state) {
 $nlp_state = $nlp_state|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $nlp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $nlp_state;
 $1 = $0;
 $2 = ($1|0)!=(0|0);
 if ($2) {
  $3 = $0;
  $nlp = $3;
  $4 = $nlp;
  $5 = ((($4)) + 3084|0);
  $6 = HEAP32[$5>>2]|0;
  _codec2_fft_free($6);
  $7 = $0;
  _free($7);
  STACKTOP = sp;return;
 } else {
  ___assert_fail((51241|0),(51196|0),185,(51259|0));
  // unreachable;
 }
}
function _lsp_bits($i) {
 $i = $i|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $i;
 $1 = $0;
 $2 = (536 + ($1<<4)|0);
 $3 = ((($2)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($4|0);
}
function _lspd_bits($i) {
 $i = $i|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $i;
 $1 = $0;
 $2 = (712 + ($1<<4)|0);
 $3 = ((($2)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($4|0);
}
function _mel_bits($i) {
 $i = $i|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $i;
 $1 = $0;
 $2 = (45272 + ($1<<4)|0);
 $3 = ((($2)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($4|0);
}
function _lspmelvq_cb_bits($i) {
 $i = $i|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $i;
 $1 = $0;
 $2 = (45576 + ($1<<4)|0);
 $3 = ((($2)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($4|0);
}
function _lsp_pred_vq_bits($i) {
 $i = $i|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $i;
 $1 = $0;
 $2 = (4248 + ($1<<4)|0);
 $3 = ((($2)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($4|0);
}
function _quantise_init() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _decode_lspds_scalar($lsp_,$indexes,$order) {
 $lsp_ = $lsp_|0;
 $indexes = $indexes|0;
 $order = $order|0;
 var $$alloca_mul = 0, $$alloca_mul5 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0.0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0.0, $36 = 0, $37 = 0, $38 = 0.0, $39 = 0.0, $4 = 0, $40 = 0, $41 = 0, $42 = 0.0;
 var $43 = 0, $44 = 0, $45 = 0.0, $46 = 0.0, $47 = 0.0, $48 = 0.0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $cb = 0, $i = 0, $k = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $lsp_;
 $1 = $indexes;
 $2 = $order;
 $4 = $2;
 $5 = (_llvm_stacksave()|0);
 $3 = $5;
 $$alloca_mul = $4<<2;
 $6 = STACKTOP; STACKTOP = STACKTOP + ((((1*$$alloca_mul)|0)+15)&-16)|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();;
 $7 = $2;
 $$alloca_mul5 = $7<<2;
 $8 = STACKTOP; STACKTOP = STACKTOP + ((((1*$$alloca_mul5)|0)+15)&-16)|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();;
 $i = 0;
 while(1) {
  $9 = $i;
  $10 = $2;
  $11 = ($9|0)<($10|0);
  if (!($11)) {
   break;
  }
  $12 = $i;
  $13 = (712 + ($12<<4)|0);
  $14 = HEAP32[$13>>2]|0;
  $k = $14;
  $15 = $i;
  $16 = (712 + ($15<<4)|0);
  $17 = ((($16)) + 12|0);
  $18 = HEAP32[$17>>2]|0;
  $cb = $18;
  $19 = $i;
  $20 = $1;
  $21 = (($20) + ($19<<2)|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = $k;
  $24 = Math_imul($22, $23)|0;
  $25 = $cb;
  $26 = (($25) + ($24<<2)|0);
  $27 = +HEAPF32[$26>>2];
  $28 = $i;
  $29 = (($8) + ($28<<2)|0);
  HEAPF32[$29>>2] = $27;
  $30 = $i;
  $31 = ($30|0)!=(0);
  if ($31) {
   $32 = $i;
   $33 = (($32) - 1)|0;
   $34 = (($6) + ($33<<2)|0);
   $35 = +HEAPF32[$34>>2];
   $36 = $i;
   $37 = (($8) + ($36<<2)|0);
   $38 = +HEAPF32[$37>>2];
   $39 = $35 + $38;
   $40 = $i;
   $41 = (($6) + ($40<<2)|0);
   HEAPF32[$41>>2] = $39;
  } else {
   $42 = +HEAPF32[$8>>2];
   HEAPF32[$6>>2] = $42;
  }
  $43 = $i;
  $44 = (($6) + ($43<<2)|0);
  $45 = +HEAPF32[$44>>2];
  $46 = $45;
  $47 = 7.8539816349999997E-4 * $46;
  $48 = $47;
  $49 = $i;
  $50 = $0;
  $51 = (($50) + ($49<<2)|0);
  HEAPF32[$51>>2] = $48;
  $52 = $i;
  $53 = (($52) + 1)|0;
  $i = $53;
 }
 $54 = $3;
 _llvm_stackrestore(($54|0));
 STACKTOP = sp;return;
}
function _lspmelvq_decode($indexes,$xq,$ndim) {
 $indexes = $indexes|0;
 $xq = $xq|0;
 $ndim = $ndim|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0.0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0.0, $33 = 0.0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0.0, $42 = 0.0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $codebook1 = 0, $codebook2 = 0, $codebook3 = 0, $i = 0, $n1 = 0, $n2 = 0, $n3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $indexes;
 $1 = $xq;
 $2 = $ndim;
 $3 = HEAP32[(45588)>>2]|0;
 $codebook1 = $3;
 $4 = HEAP32[(45604)>>2]|0;
 $codebook2 = $4;
 $5 = HEAP32[(45620)>>2]|0;
 $codebook3 = $5;
 $6 = $0;
 $7 = HEAP32[$6>>2]|0;
 $n1 = $7;
 $8 = $0;
 $9 = ((($8)) + 4|0);
 $10 = HEAP32[$9>>2]|0;
 $n2 = $10;
 $11 = $0;
 $12 = ((($11)) + 8|0);
 $13 = HEAP32[$12>>2]|0;
 $n3 = $13;
 $i = 0;
 while(1) {
  $14 = $i;
  $15 = $2;
  $16 = ($14|0)<($15|0);
  if (!($16)) {
   break;
  }
  $17 = $2;
  $18 = $n1;
  $19 = Math_imul($17, $18)|0;
  $20 = $i;
  $21 = (($19) + ($20))|0;
  $22 = $codebook1;
  $23 = (($22) + ($21<<2)|0);
  $24 = +HEAPF32[$23>>2];
  $25 = $2;
  $26 = $n2;
  $27 = Math_imul($25, $26)|0;
  $28 = $i;
  $29 = (($27) + ($28))|0;
  $30 = $codebook2;
  $31 = (($30) + ($29<<2)|0);
  $32 = +HEAPF32[$31>>2];
  $33 = $24 + $32;
  $34 = $2;
  $35 = $n3;
  $36 = Math_imul($34, $35)|0;
  $37 = $i;
  $38 = (($36) + ($37))|0;
  $39 = $codebook3;
  $40 = (($39) + ($38<<2)|0);
  $41 = +HEAPF32[$40>>2];
  $42 = $33 + $41;
  $43 = $i;
  $44 = $1;
  $45 = (($44) + ($43<<2)|0);
  HEAPF32[$45>>2] = $42;
  $46 = $i;
  $47 = (($46) + 1)|0;
  $i = $47;
 }
 STACKTOP = sp;return;
}
function _check_lsp_order($lsp,$order) {
 $lsp = $lsp|0;
 $order = $order|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0.0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0.0, $22 = 0, $23 = 0, $24 = 0, $25 = 0.0, $26 = 0.0;
 var $27 = 0.0, $28 = 0.0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0.0, $34 = 0.0, $35 = 0.0, $36 = 0.0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0.0, $9 = 0, $i = 0, $swaps = 0, $tmp = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $lsp;
 $1 = $order;
 $swaps = 0;
 $i = 1;
 while(1) {
  $2 = $i;
  $3 = $1;
  $4 = ($2|0)<($3|0);
  if (!($4)) {
   break;
  }
  $5 = $i;
  $6 = $0;
  $7 = (($6) + ($5<<2)|0);
  $8 = +HEAPF32[$7>>2];
  $9 = $i;
  $10 = (($9) - 1)|0;
  $11 = $0;
  $12 = (($11) + ($10<<2)|0);
  $13 = +HEAPF32[$12>>2];
  $14 = $8 < $13;
  if ($14) {
   $15 = $swaps;
   $16 = (($15) + 1)|0;
   $swaps = $16;
   $17 = $i;
   $18 = (($17) - 1)|0;
   $19 = $0;
   $20 = (($19) + ($18<<2)|0);
   $21 = +HEAPF32[$20>>2];
   $tmp = $21;
   $22 = $i;
   $23 = $0;
   $24 = (($23) + ($22<<2)|0);
   $25 = +HEAPF32[$24>>2];
   $26 = $25;
   $27 = $26 - 0.10000000000000001;
   $28 = $27;
   $29 = $i;
   $30 = (($29) - 1)|0;
   $31 = $0;
   $32 = (($31) + ($30<<2)|0);
   HEAPF32[$32>>2] = $28;
   $33 = $tmp;
   $34 = $33;
   $35 = $34 + 0.10000000000000001;
   $36 = $35;
   $37 = $i;
   $38 = $0;
   $39 = (($38) + ($37<<2)|0);
   HEAPF32[$39>>2] = $36;
   $i = 1;
  }
  $40 = $i;
  $41 = (($40) + 1)|0;
  $i = $41;
 }
 $42 = $swaps;
 STACKTOP = sp;return ($42|0);
}
function _lpc_post_filter($fftr_fwd_cfg,$Pw,$ak,$order,$dump,$beta,$gamma,$bass_boost,$E) {
 $fftr_fwd_cfg = $fftr_fwd_cfg|0;
 $Pw = $Pw|0;
 $ak = $ak|0;
 $order = $order|0;
 $dump = $dump|0;
 $beta = +$beta;
 $gamma = +$gamma;
 $bass_boost = $bass_boost|0;
 $E = +$E;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0.0, $104 = 0.0, $105 = 0.0, $106 = 0.0, $107 = 0.0, $108 = 0.0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0.0, $113 = 0.0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0.0, $118 = 0.0, $119 = 0.0, $12 = 0, $120 = 0, $121 = 0, $122 = 0.0, $123 = 0.0, $124 = 0.0, $125 = 0.0, $126 = 0.0, $127 = 0.0, $128 = 0, $129 = 0, $13 = 0, $130 = 0.0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0.0, $135 = 0.0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0.0, $146 = 0.0, $147 = 0.0, $148 = 0.0, $149 = 0, $15 = 0, $150 = 0, $16 = 0.0;
 var $17 = 0.0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0.0, $25 = 0.0, $26 = 0.0, $27 = 0, $28 = 0, $29 = 0.0, $3 = 0, $30 = 0.0, $31 = 0.0, $32 = 0, $33 = 0, $34 = 0;
 var $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0.0, $4 = 0, $40 = 0, $41 = 0, $42 = 0.0, $43 = 0.0, $44 = 0, $45 = 0, $46 = 0, $47 = 0.0, $48 = 0, $49 = 0, $5 = 0.0, $50 = 0, $51 = 0.0, $52 = 0.0;
 var $53 = 0.0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0.0, $60 = 0, $61 = 0, $62 = 0.0, $63 = 0, $64 = 0, $65 = 0, $66 = 0.0, $67 = 0.0, $68 = 0.0, $69 = 0, $7 = 0, $70 = 0;
 var $71 = 0, $72 = 0, $73 = 0.0, $74 = 0.0, $75 = 0, $76 = 0, $77 = 0, $78 = 0.0, $79 = 0, $8 = 0.0, $80 = 0, $81 = 0.0, $82 = 0.0, $83 = 0, $84 = 0, $85 = 0, $86 = 0.0, $87 = 0, $88 = 0, $89 = 0;
 var $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0.0, $95 = 0.0, $96 = 0.0, $97 = 0, $98 = 0, $99 = 0, $Pfw = 0.0, $Rw = 0, $Ww = 0, $coeff = 0.0, $e_after = 0.0, $e_before = 0.0, $gain = 0.0, $i = 0, $max_Rw = 0.0;
 var $min_Rw = 0.0, $x = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 5200|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $x = sp + 3112|0;
 $Ww = sp + 1056|0;
 $Rw = sp + 28|0;
 $0 = $fftr_fwd_cfg;
 $1 = $Pw;
 $2 = $ak;
 $3 = $order;
 $4 = $dump;
 $5 = $beta;
 $6 = $gamma;
 $7 = $bass_boost;
 $8 = $E;
 $i = 0;
 while(1) {
  $9 = $i;
  $10 = ($9|0)<(512);
  if (!($10)) {
   break;
  }
  $11 = $i;
  $12 = (($x) + ($11<<2)|0);
  HEAPF32[$12>>2] = 0.0;
  $13 = $i;
  $14 = (($13) + 1)|0;
  $i = $14;
 }
 $15 = $2;
 $16 = +HEAPF32[$15>>2];
 HEAPF32[$x>>2] = $16;
 $17 = $6;
 $coeff = $17;
 $i = 1;
 while(1) {
  $18 = $i;
  $19 = $3;
  $20 = ($18|0)<=($19|0);
  if (!($20)) {
   break;
  }
  $21 = $i;
  $22 = $2;
  $23 = (($22) + ($21<<2)|0);
  $24 = +HEAPF32[$23>>2];
  $25 = $coeff;
  $26 = $24 * $25;
  $27 = $i;
  $28 = (($x) + ($27<<2)|0);
  HEAPF32[$28>>2] = $26;
  $29 = $6;
  $30 = $coeff;
  $31 = $30 * $29;
  $coeff = $31;
  $32 = $i;
  $33 = (($32) + 1)|0;
  $i = $33;
 }
 $34 = $0;
 _codec2_fftr($34,$x,$Ww);
 $i = 0;
 while(1) {
  $35 = $i;
  $36 = ($35|0)<(256);
  if (!($36)) {
   break;
  }
  $37 = $i;
  $38 = (($Ww) + ($37<<3)|0);
  $39 = +HEAPF32[$38>>2];
  $40 = $i;
  $41 = (($Ww) + ($40<<3)|0);
  $42 = +HEAPF32[$41>>2];
  $43 = $39 * $42;
  $44 = $i;
  $45 = (($Ww) + ($44<<3)|0);
  $46 = ((($45)) + 4|0);
  $47 = +HEAPF32[$46>>2];
  $48 = $i;
  $49 = (($Ww) + ($48<<3)|0);
  $50 = ((($49)) + 4|0);
  $51 = +HEAPF32[$50>>2];
  $52 = $47 * $51;
  $53 = $43 + $52;
  $54 = $i;
  $55 = (($Ww) + ($54<<3)|0);
  HEAPF32[$55>>2] = $53;
  $56 = $i;
  $57 = (($56) + 1)|0;
  $i = $57;
 }
 $max_Rw = 0.0;
 $min_Rw = 1.0000000331813535E+32;
 $i = 0;
 while(1) {
  $58 = $i;
  $59 = ($58|0)<(256);
  if (!($59)) {
   break;
  }
  $60 = $i;
  $61 = (($Ww) + ($60<<3)|0);
  $62 = +HEAPF32[$61>>2];
  $63 = $i;
  $64 = $1;
  $65 = (($64) + ($63<<2)|0);
  $66 = +HEAPF32[$65>>2];
  $67 = $62 * $66;
  $68 = (+Math_sqrt((+$67)));
  $69 = $i;
  $70 = (($Rw) + ($69<<2)|0);
  HEAPF32[$70>>2] = $68;
  $71 = $i;
  $72 = (($Rw) + ($71<<2)|0);
  $73 = +HEAPF32[$72>>2];
  $74 = $max_Rw;
  $75 = $73 > $74;
  if ($75) {
   $76 = $i;
   $77 = (($Rw) + ($76<<2)|0);
   $78 = +HEAPF32[$77>>2];
   $max_Rw = $78;
  }
  $79 = $i;
  $80 = (($Rw) + ($79<<2)|0);
  $81 = +HEAPF32[$80>>2];
  $82 = $min_Rw;
  $83 = $81 < $82;
  if ($83) {
   $84 = $i;
   $85 = (($Rw) + ($84<<2)|0);
   $86 = +HEAPF32[$85>>2];
   $min_Rw = $86;
  }
  $87 = $i;
  $88 = (($87) + 1)|0;
  $i = $88;
 }
 $e_before = 9.9999997473787516E-5;
 $i = 0;
 while(1) {
  $89 = $i;
  $90 = ($89|0)<(256);
  if (!($90)) {
   break;
  }
  $91 = $i;
  $92 = $1;
  $93 = (($92) + ($91<<2)|0);
  $94 = +HEAPF32[$93>>2];
  $95 = $e_before;
  $96 = $95 + $94;
  $e_before = $96;
  $97 = $i;
  $98 = (($97) + 1)|0;
  $i = $98;
 }
 $e_after = 9.9999997473787516E-5;
 $i = 0;
 while(1) {
  $99 = $i;
  $100 = ($99|0)<(256);
  if (!($100)) {
   break;
  }
  $101 = $i;
  $102 = (($Rw) + ($101<<2)|0);
  $103 = +HEAPF32[$102>>2];
  $104 = $5;
  $105 = (+Math_pow((+$103),(+$104)));
  $Pfw = $105;
  $106 = $Pfw;
  $107 = $Pfw;
  $108 = $106 * $107;
  $109 = $i;
  $110 = $1;
  $111 = (($110) + ($109<<2)|0);
  $112 = +HEAPF32[$111>>2];
  $113 = $112 * $108;
  HEAPF32[$111>>2] = $113;
  $114 = $i;
  $115 = $1;
  $116 = (($115) + ($114<<2)|0);
  $117 = +HEAPF32[$116>>2];
  $118 = $e_after;
  $119 = $118 + $117;
  $e_after = $119;
  $120 = $i;
  $121 = (($120) + 1)|0;
  $i = $121;
 }
 $122 = $e_before;
 $123 = $e_after;
 $124 = $122 / $123;
 $gain = $124;
 $125 = $8;
 $126 = $gain;
 $127 = $126 * $125;
 $gain = $127;
 $i = 0;
 while(1) {
  $128 = $i;
  $129 = ($128|0)<(256);
  if (!($129)) {
   break;
  }
  $130 = $gain;
  $131 = $i;
  $132 = $1;
  $133 = (($132) + ($131<<2)|0);
  $134 = +HEAPF32[$133>>2];
  $135 = $134 * $130;
  HEAPF32[$133>>2] = $135;
  $136 = $i;
  $137 = (($136) + 1)|0;
  $i = $137;
 }
 $138 = $7;
 $139 = ($138|0)!=(0);
 if (!($139)) {
  STACKTOP = sp;return;
 }
 $i = 0;
 while(1) {
  $140 = $i;
  $141 = ($140|0)<(64);
  if (!($141)) {
   break;
  }
  $142 = $i;
  $143 = $1;
  $144 = (($143) + ($142<<2)|0);
  $145 = +HEAPF32[$144>>2];
  $146 = $145;
  $147 = $146 * 1.9599999999999997;
  $148 = $147;
  HEAPF32[$144>>2] = $148;
  $149 = $i;
  $150 = (($149) + 1)|0;
  $i = $150;
 }
 STACKTOP = sp;return;
}
function _codec2_fftr($cfg,$in,$out) {
 $cfg = $cfg|0;
 $in = $in|0;
 $out = $out|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $cfg;
 $1 = $in;
 $2 = $out;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 _kiss_fftr($3,$4,$5);
 STACKTOP = sp;return;
}
function _aks_to_M2($fftr_fwd_cfg,$ak,$order,$model,$E,$snr,$dump,$sim_pf,$pf,$bass_boost,$beta,$gamma,$Aw) {
 $fftr_fwd_cfg = $fftr_fwd_cfg|0;
 $ak = $ak|0;
 $order = $order|0;
 $model = $model|0;
 $E = +$E;
 $snr = $snr|0;
 $dump = $dump|0;
 $sim_pf = $sim_pf|0;
 $pf = $pf|0;
 $bass_boost = $bass_boost|0;
 $beta = +$beta;
 $gamma = +$gamma;
 $Aw = $Aw|0;
 var $$ = 0, $0 = 0, $1 = 0, $10 = 0.0, $100 = 0.0, $101 = 0.0, $102 = 0, $103 = 0.0, $104 = 0.0, $105 = 0.0, $106 = 0.0, $107 = 0.0, $108 = 0.0, $109 = 0.0, $11 = 0.0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0;
 var $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0.0, $12 = 0, $120 = 0.0, $121 = 0.0, $122 = 0, $123 = 0, $124 = 0.0, $125 = 0.0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0.0, $131 = 0, $132 = 0;
 var $133 = 0, $134 = 0, $135 = 0.0, $136 = 0.0, $137 = 0.0, $138 = 0.0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0.0, $144 = 0.0, $145 = 0.0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0.0;
 var $151 = 0.0, $152 = 0.0, $153 = 0.0, $154 = 0.0, $155 = 0.0, $156 = 0, $157 = 0, $158 = 0.0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0.0, $164 = 0, $165 = 0.0, $166 = 0.0, $167 = 0.0, $168 = 0.0, $169 = 0.0;
 var $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0.0, $175 = 0, $176 = 0.0, $177 = 0.0, $178 = 0.0, $179 = 0.0, $18 = 0, $180 = 0.0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0.0;
 var $188 = 0.0, $189 = 0.0, $19 = 0, $190 = 0.0, $191 = 0.0, $192 = 0.0, $193 = 0.0, $194 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0.0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0.0, $38 = 0, $39 = 0, $4 = 0.0, $40 = 0, $41 = 0.0, $42 = 0.0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0.0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0.0, $53 = 0.0, $54 = 0.0, $55 = 0.0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0.0, $7 = 0, $70 = 0.0, $71 = 0, $72 = 0.0, $73 = 0, $74 = 0, $75 = 0.0, $76 = 0, $77 = 0, $78 = 0.0, $79 = 0.0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0, $91 = 0.0, $92 = 0.0, $93 = 0.0, $94 = 0.0, $95 = 0.0, $96 = 0.0, $97 = 0.0, $98 = 0, $99 = 0, $Am = 0.0, $Em = 0.0, $Pw = 0, $a = 0;
 var $am = 0, $bm = 0, $i = 0, $m = 0, $noise = 0.0, $r = 0.0, $signal = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 3168|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $a = sp + 1024|0;
 $Pw = sp;
 $0 = $fftr_fwd_cfg;
 $1 = $ak;
 $2 = $order;
 $3 = $model;
 $4 = $E;
 $5 = $snr;
 $6 = $dump;
 $7 = $sim_pf;
 $8 = $pf;
 $9 = $bass_boost;
 $10 = $beta;
 $11 = $gamma;
 $12 = $Aw;
 $r = 0.012271846644580364;
 $i = 0;
 while(1) {
  $13 = $i;
  $14 = ($13|0)<(512);
  if (!($14)) {
   break;
  }
  $15 = $i;
  $16 = (($a) + ($15<<2)|0);
  HEAPF32[$16>>2] = 0.0;
  $17 = $i;
  $18 = (($17) + 1)|0;
  $i = $18;
 }
 $i = 0;
 while(1) {
  $19 = $i;
  $20 = $2;
  $21 = ($19|0)<=($20|0);
  if (!($21)) {
   break;
  }
  $22 = $i;
  $23 = $1;
  $24 = (($23) + ($22<<2)|0);
  $25 = +HEAPF32[$24>>2];
  $26 = $i;
  $27 = (($a) + ($26<<2)|0);
  HEAPF32[$27>>2] = $25;
  $28 = $i;
  $29 = (($28) + 1)|0;
  $i = $29;
 }
 $30 = $0;
 $31 = $12;
 _codec2_fftr($30,$a,$31);
 $i = 0;
 while(1) {
  $32 = $i;
  $33 = ($32|0)<(256);
  if (!($33)) {
   break;
  }
  $34 = $i;
  $35 = $12;
  $36 = (($35) + ($34<<3)|0);
  $37 = +HEAPF32[$36>>2];
  $38 = $i;
  $39 = $12;
  $40 = (($39) + ($38<<3)|0);
  $41 = +HEAPF32[$40>>2];
  $42 = $37 * $41;
  $43 = $i;
  $44 = $12;
  $45 = (($44) + ($43<<3)|0);
  $46 = ((($45)) + 4|0);
  $47 = +HEAPF32[$46>>2];
  $48 = $i;
  $49 = $12;
  $50 = (($49) + ($48<<3)|0);
  $51 = ((($50)) + 4|0);
  $52 = +HEAPF32[$51>>2];
  $53 = $47 * $52;
  $54 = $42 + $53;
  $55 = $54;
  $56 = $55 + 9.9999999999999995E-7;
  $57 = 1.0 / $56;
  $58 = $57;
  $59 = $i;
  $60 = (($Pw) + ($59<<2)|0);
  HEAPF32[$60>>2] = $58;
  $61 = $i;
  $62 = (($61) + 1)|0;
  $i = $62;
 }
 $63 = $8;
 $64 = ($63|0)!=(0);
 L13: do {
  if ($64) {
   $65 = $0;
   $66 = $1;
   $67 = $2;
   $68 = $6;
   $69 = $10;
   $70 = $11;
   $71 = $9;
   $72 = $4;
   _lpc_post_filter($65,$Pw,$66,$67,$68,$69,$70,$71,$72);
  } else {
   $i = 0;
   while(1) {
    $73 = $i;
    $74 = ($73|0)<(256);
    if (!($74)) {
     break L13;
    }
    $75 = $4;
    $76 = $i;
    $77 = (($Pw) + ($76<<2)|0);
    $78 = +HEAPF32[$77>>2];
    $79 = $78 * $75;
    HEAPF32[$77>>2] = $79;
    $80 = $i;
    $81 = (($80) + 1)|0;
    $i = $81;
   }
  }
 } while(0);
 $signal = 1.0000000031710769E-30;
 $noise = 1.000000023742228E-32;
 $m = 1;
 while(1) {
  $82 = $m;
  $83 = $3;
  $84 = ((($83)) + 4|0);
  $85 = HEAP32[$84>>2]|0;
  $86 = ($82|0)<=($85|0);
  if (!($86)) {
   break;
  }
  $87 = $m;
  $88 = (+($87|0));
  $89 = $88 - 0.5;
  $90 = $3;
  $91 = +HEAPF32[$90>>2];
  $92 = $91;
  $93 = $89 * $92;
  $94 = $r;
  $95 = $94;
  $96 = $93 / $95;
  $97 = $96 + 0.5;
  $98 = (~~(($97)));
  $am = $98;
  $99 = $m;
  $100 = (+($99|0));
  $101 = $100 + 0.5;
  $102 = $3;
  $103 = +HEAPF32[$102>>2];
  $104 = $103;
  $105 = $101 * $104;
  $106 = $r;
  $107 = $106;
  $108 = $105 / $107;
  $109 = $108 + 0.5;
  $110 = (~~(($109)));
  $bm = $110;
  $111 = $bm;
  $112 = ($111|0)>(256);
  $$ = $112 ? 256 : $110;
  $bm = $$;
  $Em = 0.0;
  $113 = $am;
  $i = $113;
  while(1) {
   $114 = $i;
   $115 = $bm;
   $116 = ($114|0)<($115|0);
   if (!($116)) {
    break;
   }
   $117 = $i;
   $118 = (($Pw) + ($117<<2)|0);
   $119 = +HEAPF32[$118>>2];
   $120 = $Em;
   $121 = $120 + $119;
   $Em = $121;
   $122 = $i;
   $123 = (($122) + 1)|0;
   $i = $123;
  }
  $124 = $Em;
  $125 = (+Math_sqrt((+$124)));
  $Am = $125;
  $126 = $m;
  $127 = $3;
  $128 = ((($127)) + 8|0);
  $129 = (($128) + ($126<<2)|0);
  $130 = +HEAPF32[$129>>2];
  $131 = $m;
  $132 = $3;
  $133 = ((($132)) + 8|0);
  $134 = (($133) + ($131<<2)|0);
  $135 = +HEAPF32[$134>>2];
  $136 = $130 * $135;
  $137 = $signal;
  $138 = $137 + $136;
  $signal = $138;
  $139 = $m;
  $140 = $3;
  $141 = ((($140)) + 8|0);
  $142 = (($141) + ($139<<2)|0);
  $143 = +HEAPF32[$142>>2];
  $144 = $Am;
  $145 = $143 - $144;
  $146 = $m;
  $147 = $3;
  $148 = ((($147)) + 8|0);
  $149 = (($148) + ($146<<2)|0);
  $150 = +HEAPF32[$149>>2];
  $151 = $Am;
  $152 = $150 - $151;
  $153 = $145 * $152;
  $154 = $noise;
  $155 = $154 + $153;
  $noise = $155;
  $156 = $7;
  $157 = ($156|0)!=(0);
  if ($157) {
   $158 = $Am;
   $159 = $m;
   $160 = $3;
   $161 = ((($160)) + 8|0);
   $162 = (($161) + ($159<<2)|0);
   $163 = +HEAPF32[$162>>2];
   $164 = $158 > $163;
   if ($164) {
    $165 = $Am;
    $166 = $165;
    $167 = $166 * 0.69999999999999996;
    $168 = $167;
    $Am = $168;
   }
   $169 = $Am;
   $170 = $m;
   $171 = $3;
   $172 = ((($171)) + 8|0);
   $173 = (($172) + ($170<<2)|0);
   $174 = +HEAPF32[$173>>2];
   $175 = $169 < $174;
   if ($175) {
    $176 = $Am;
    $177 = $176;
    $178 = $177 * 1.3999999999999999;
    $179 = $178;
    $Am = $179;
   }
  }
  $180 = $Am;
  $181 = $m;
  $182 = $3;
  $183 = ((($182)) + 8|0);
  $184 = (($183) + ($181<<2)|0);
  HEAPF32[$184>>2] = $180;
  $185 = $m;
  $186 = (($185) + 1)|0;
  $m = $186;
 }
 $187 = $signal;
 $188 = $noise;
 $189 = $187 / $188;
 $190 = (+_log10f($189));
 $191 = $190;
 $192 = 10.0 * $191;
 $193 = $192;
 $194 = $5;
 HEAPF32[$194>>2] = $193;
 STACKTOP = sp;return;
}
function _decode_Wo($index,$bits) {
 $index = $index|0;
 $bits = $bits|0;
 var $0 = 0, $1 = 0, $10 = 0.0, $11 = 0.0, $12 = 0, $13 = 0.0, $14 = 0.0, $15 = 0.0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0.0, $5 = 0.0, $6 = 0.0, $7 = 0, $8 = 0.0, $9 = 0.0, $Wo = 0.0, $Wo_levels = 0, $Wo_max = 0.0;
 var $Wo_min = 0.0, $step = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $index;
 $1 = $bits;
 $Wo_min = 0.039269909262657166;
 $Wo_max = 0.31415927410125732;
 $2 = $1;
 $3 = 1 << $2;
 $Wo_levels = $3;
 $4 = $Wo_max;
 $5 = $Wo_min;
 $6 = $4 - $5;
 $7 = $Wo_levels;
 $8 = (+($7|0));
 $9 = $6 / $8;
 $step = $9;
 $10 = $Wo_min;
 $11 = $step;
 $12 = $0;
 $13 = (+($12|0));
 $14 = $11 * $13;
 $15 = $10 + $14;
 $Wo = $15;
 $16 = $Wo;
 STACKTOP = sp;return (+$16);
}
function _decode_log_Wo($index,$bits) {
 $index = $index|0;
 $bits = $bits|0;
 var $0 = 0, $1 = 0, $10 = 0.0, $11 = 0.0, $12 = 0.0, $13 = 0.0, $14 = 0.0, $15 = 0, $16 = 0.0, $17 = 0.0, $18 = 0.0, $19 = 0.0, $2 = 0, $20 = 0.0, $3 = 0, $4 = 0.0, $5 = 0.0, $6 = 0.0, $7 = 0.0, $8 = 0.0;
 var $9 = 0, $Wo = 0.0, $Wo_levels = 0, $Wo_max = 0.0, $Wo_min = 0.0, $step = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $index;
 $1 = $bits;
 $Wo_min = 0.039269909262657166;
 $Wo_max = 0.31415927410125732;
 $2 = $1;
 $3 = 1 << $2;
 $Wo_levels = $3;
 $4 = $Wo_max;
 $5 = (+_log10f($4));
 $6 = $Wo_min;
 $7 = (+_log10f($6));
 $8 = $5 - $7;
 $9 = $Wo_levels;
 $10 = (+($9|0));
 $11 = $8 / $10;
 $step = $11;
 $12 = $Wo_min;
 $13 = (+_log10f($12));
 $14 = $step;
 $15 = $0;
 $16 = (+($15|0));
 $17 = $14 * $16;
 $18 = $13 + $17;
 $Wo = $18;
 $19 = $Wo;
 $20 = (+Math_pow(10.0,(+$19)));
 STACKTOP = sp;return (+$20);
}
function _decode_lsps_scalar($lsp,$indexes,$order) {
 $lsp = $lsp|0;
 $indexes = $indexes|0;
 $order = $order|0;
 var $$alloca_mul = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0.0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0.0, $36 = 0.0, $37 = 0.0, $38 = 0.0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $cb = 0, $i = 0, $k = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $lsp;
 $1 = $indexes;
 $2 = $order;
 $4 = $2;
 $5 = (_llvm_stacksave()|0);
 $3 = $5;
 $$alloca_mul = $4<<2;
 $6 = STACKTOP; STACKTOP = STACKTOP + ((((1*$$alloca_mul)|0)+15)&-16)|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();;
 $i = 0;
 while(1) {
  $7 = $i;
  $8 = $2;
  $9 = ($7|0)<($8|0);
  if (!($9)) {
   break;
  }
  $10 = $i;
  $11 = (536 + ($10<<4)|0);
  $12 = HEAP32[$11>>2]|0;
  $k = $12;
  $13 = $i;
  $14 = (536 + ($13<<4)|0);
  $15 = ((($14)) + 12|0);
  $16 = HEAP32[$15>>2]|0;
  $cb = $16;
  $17 = $i;
  $18 = $1;
  $19 = (($18) + ($17<<2)|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = $k;
  $22 = Math_imul($20, $21)|0;
  $23 = $cb;
  $24 = (($23) + ($22<<2)|0);
  $25 = +HEAPF32[$24>>2];
  $26 = $i;
  $27 = (($6) + ($26<<2)|0);
  HEAPF32[$27>>2] = $25;
  $28 = $i;
  $29 = (($28) + 1)|0;
  $i = $29;
 }
 $i = 0;
 while(1) {
  $30 = $i;
  $31 = $2;
  $32 = ($30|0)<($31|0);
  if (!($32)) {
   break;
  }
  $33 = $i;
  $34 = (($6) + ($33<<2)|0);
  $35 = +HEAPF32[$34>>2];
  $36 = $35;
  $37 = 7.8539816349999997E-4 * $36;
  $38 = $37;
  $39 = $i;
  $40 = $0;
  $41 = (($40) + ($39<<2)|0);
  HEAPF32[$41>>2] = $38;
  $42 = $i;
  $43 = (($42) + 1)|0;
  $i = $43;
 }
 $44 = $3;
 _llvm_stackrestore(($44|0));
 STACKTOP = sp;return;
}
function _decode_mels_scalar($mels,$indexes,$order) {
 $mels = $mels|0;
 $indexes = $indexes|0;
 $order = $order|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0.0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0.0, $25 = 0.0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0.0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var $cb = 0, $i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $mels;
 $1 = $indexes;
 $2 = $order;
 $i = 0;
 while(1) {
  $3 = $i;
  $4 = $2;
  $5 = ($3|0)<($4|0);
  if (!($5)) {
   break;
  }
  $6 = $i;
  $7 = (45272 + ($6<<4)|0);
  $8 = ((($7)) + 12|0);
  $9 = HEAP32[$8>>2]|0;
  $cb = $9;
  $10 = $i;
  $11 = (($10|0) % 2)&-1;
  $12 = ($11|0)!=(0);
  $13 = $i;
  if ($12) {
   $14 = (($13) - 1)|0;
   $15 = $0;
   $16 = (($15) + ($14<<2)|0);
   $17 = +HEAPF32[$16>>2];
   $18 = $i;
   $19 = $1;
   $20 = (($19) + ($18<<2)|0);
   $21 = HEAP32[$20>>2]|0;
   $22 = $cb;
   $23 = (($22) + ($21<<2)|0);
   $24 = +HEAPF32[$23>>2];
   $25 = $17 + $24;
   $26 = $i;
   $27 = $0;
   $28 = (($27) + ($26<<2)|0);
   HEAPF32[$28>>2] = $25;
  } else {
   $29 = $1;
   $30 = (($29) + ($13<<2)|0);
   $31 = HEAP32[$30>>2]|0;
   $32 = $cb;
   $33 = (($32) + ($31<<2)|0);
   $34 = +HEAPF32[$33>>2];
   $35 = $i;
   $36 = $0;
   $37 = (($36) + ($35<<2)|0);
   HEAPF32[$37>>2] = $34;
  }
  $38 = $i;
  $39 = (($38) + 1)|0;
  $i = $39;
 }
 STACKTOP = sp;return;
}
function _decode_lsps_vq($indexes,$xq,$order,$stages) {
 $indexes = $indexes|0;
 $xq = $xq|0;
 $order = $order|0;
 $stages = $stages|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0.0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0.0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0.0, $51 = 0.0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0.0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0.0, $67 = 0.0, $68 = 0, $69 = 0, $7 = 0, $8 = 0, $9 = 0, $codebook1 = 0, $codebook2 = 0, $codebook3 = 0, $i = 0, $n1 = 0, $n2 = 0, $n3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $indexes;
 $1 = $xq;
 $2 = $order;
 $3 = $stages;
 $4 = HEAP32[(4260)>>2]|0;
 $codebook1 = $4;
 $5 = HEAP32[(4276)>>2]|0;
 $codebook2 = $5;
 $6 = HEAP32[(4292)>>2]|0;
 $codebook3 = $6;
 $7 = $0;
 $8 = HEAP32[$7>>2]|0;
 $n1 = $8;
 $9 = $0;
 $10 = ((($9)) + 4|0);
 $11 = HEAP32[$10>>2]|0;
 $n2 = $11;
 $12 = $0;
 $13 = ((($12)) + 8|0);
 $14 = HEAP32[$13>>2]|0;
 $n3 = $14;
 $i = 0;
 while(1) {
  $15 = $i;
  $16 = $2;
  $17 = ($15|0)<($16|0);
  if (!($17)) {
   break;
  }
  $18 = $2;
  $19 = $n1;
  $20 = Math_imul($18, $19)|0;
  $21 = $i;
  $22 = (($20) + ($21))|0;
  $23 = $codebook1;
  $24 = (($23) + ($22<<2)|0);
  $25 = +HEAPF32[$24>>2];
  $26 = $i;
  $27 = $1;
  $28 = (($27) + ($26<<2)|0);
  HEAPF32[$28>>2] = $25;
  $29 = $i;
  $30 = (($29) + 1)|0;
  $i = $30;
 }
 $31 = $3;
 $32 = ($31|0)!=(1);
 if (!($32)) {
  STACKTOP = sp;return;
 }
 $i = 0;
 while(1) {
  $33 = $i;
  $34 = $2;
  $35 = (($34|0) / 2)&-1;
  $36 = ($33|0)<($35|0);
  if (!($36)) {
   break;
  }
  $37 = $2;
  $38 = $n2;
  $39 = Math_imul($37, $38)|0;
  $40 = (($39|0) / 2)&-1;
  $41 = $i;
  $42 = (($40) + ($41))|0;
  $43 = $codebook2;
  $44 = (($43) + ($42<<2)|0);
  $45 = +HEAPF32[$44>>2];
  $46 = $i;
  $47 = $46<<1;
  $48 = $1;
  $49 = (($48) + ($47<<2)|0);
  $50 = +HEAPF32[$49>>2];
  $51 = $50 + $45;
  HEAPF32[$49>>2] = $51;
  $52 = $2;
  $53 = $n3;
  $54 = Math_imul($52, $53)|0;
  $55 = (($54|0) / 2)&-1;
  $56 = $i;
  $57 = (($55) + ($56))|0;
  $58 = $codebook3;
  $59 = (($58) + ($57<<2)|0);
  $60 = +HEAPF32[$59>>2];
  $61 = $i;
  $62 = $61<<1;
  $63 = (($62) + 1)|0;
  $64 = $1;
  $65 = (($64) + ($63<<2)|0);
  $66 = +HEAPF32[$65>>2];
  $67 = $66 + $60;
  HEAPF32[$65>>2] = $67;
  $68 = $i;
  $69 = (($68) + 1)|0;
  $i = $69;
 }
 STACKTOP = sp;return;
}
function _bw_expand_lsps($lsp,$order,$min_sep_low,$min_sep_high) {
 $lsp = $lsp|0;
 $order = $order|0;
 $min_sep_low = +$min_sep_low;
 $min_sep_high = +$min_sep_high;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0.0, $15 = 0.0, $16 = 0.0, $17 = 0.0, $18 = 0.0, $19 = 0.0, $2 = 0.0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0.0, $26 = 0.0;
 var $27 = 0.0, $28 = 0.0, $29 = 0.0, $3 = 0.0, $30 = 0.0, $31 = 0.0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0.0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0.0, $49 = 0.0, $5 = 0, $50 = 0.0, $51 = 0.0, $52 = 0.0, $53 = 0.0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0.0, $62 = 0.0;
 var $63 = 0.0, $64 = 0.0, $65 = 0.0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $8 = 0, $9 = 0.0, $i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $lsp;
 $1 = $order;
 $2 = $min_sep_low;
 $3 = $min_sep_high;
 $i = 1;
 while(1) {
  $4 = $i;
  $5 = ($4|0)<(4);
  if (!($5)) {
   break;
  }
  $6 = $i;
  $7 = $0;
  $8 = (($7) + ($6<<2)|0);
  $9 = +HEAPF32[$8>>2];
  $10 = $i;
  $11 = (($10) - 1)|0;
  $12 = $0;
  $13 = (($12) + ($11<<2)|0);
  $14 = +HEAPF32[$13>>2];
  $15 = $9 - $14;
  $16 = $15;
  $17 = $2;
  $18 = $17;
  $19 = $18 * 7.8539816349999997E-4;
  $20 = $16 < $19;
  if ($20) {
   $21 = $i;
   $22 = (($21) - 1)|0;
   $23 = $0;
   $24 = (($23) + ($22<<2)|0);
   $25 = +HEAPF32[$24>>2];
   $26 = $25;
   $27 = $2;
   $28 = $27;
   $29 = $28 * 7.8539816349999997E-4;
   $30 = $26 + $29;
   $31 = $30;
   $32 = $i;
   $33 = $0;
   $34 = (($33) + ($32<<2)|0);
   HEAPF32[$34>>2] = $31;
  }
  $35 = $i;
  $36 = (($35) + 1)|0;
  $i = $36;
 }
 $i = 4;
 while(1) {
  $37 = $i;
  $38 = $1;
  $39 = ($37|0)<($38|0);
  if (!($39)) {
   break;
  }
  $40 = $i;
  $41 = $0;
  $42 = (($41) + ($40<<2)|0);
  $43 = +HEAPF32[$42>>2];
  $44 = $i;
  $45 = (($44) - 1)|0;
  $46 = $0;
  $47 = (($46) + ($45<<2)|0);
  $48 = +HEAPF32[$47>>2];
  $49 = $43 - $48;
  $50 = $49;
  $51 = $3;
  $52 = $51;
  $53 = $52 * 7.8539816349999997E-4;
  $54 = $50 < $53;
  if ($54) {
   $55 = $i;
   $56 = (($55) - 1)|0;
   $57 = $0;
   $58 = (($57) + ($56<<2)|0);
   $59 = +HEAPF32[$58>>2];
   $60 = $59;
   $61 = $3;
   $62 = $61;
   $63 = $62 * 7.8539816349999997E-4;
   $64 = $60 + $63;
   $65 = $64;
   $66 = $i;
   $67 = $0;
   $68 = (($67) + ($66<<2)|0);
   HEAPF32[$68>>2] = $65;
  }
  $69 = $i;
  $70 = (($69) + 1)|0;
  $i = $70;
 }
 STACKTOP = sp;return;
}
function _apply_lpc_correction($model) {
 $model = $model|0;
 var $0 = 0, $1 = 0, $10 = 0.0, $11 = 0.0, $2 = 0.0, $3 = 0.0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $model;
 $1 = $0;
 $2 = +HEAPF32[$1>>2];
 $3 = $2;
 $4 = $3 < 0.11780972452500001;
 if (!($4)) {
  STACKTOP = sp;return;
 }
 $5 = $0;
 $6 = ((($5)) + 8|0);
 $7 = ((($6)) + 4|0);
 $8 = +HEAPF32[$7>>2];
 $9 = $8;
 $10 = $9 * 0.032000000000000001;
 $11 = $10;
 HEAPF32[$7>>2] = $11;
 STACKTOP = sp;return;
}
function _decode_energy($index,$bits) {
 $index = $index|0;
 $bits = $bits|0;
 var $0 = 0, $1 = 0, $10 = 0.0, $11 = 0.0, $12 = 0, $13 = 0.0, $14 = 0.0, $15 = 0.0, $16 = 0.0, $17 = 0.0, $18 = 0.0, $19 = 0.0, $2 = 0, $20 = 0.0, $21 = 0.0, $3 = 0, $4 = 0.0, $5 = 0.0, $6 = 0.0, $7 = 0;
 var $8 = 0.0, $9 = 0.0, $e = 0.0, $e_levels = 0, $e_max = 0.0, $e_min = 0.0, $step = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $index;
 $1 = $bits;
 $e_min = -10.0;
 $e_max = 40.0;
 $2 = $1;
 $3 = 1 << $2;
 $e_levels = $3;
 $4 = $e_max;
 $5 = $e_min;
 $6 = $4 - $5;
 $7 = $e_levels;
 $8 = (+($7|0));
 $9 = $6 / $8;
 $step = $9;
 $10 = $e_min;
 $11 = $step;
 $12 = $0;
 $13 = (+($12|0));
 $14 = $11 * $13;
 $15 = $10 + $14;
 $e = $15;
 $16 = $e;
 $17 = $16;
 $18 = $17 / 10.0;
 $19 = $18;
 $20 = (+Math_pow(10.0,(+$19)));
 $e = $20;
 $21 = $e;
 STACKTOP = sp;return (+$21);
}
function _decode_WoE($model,$e,$xq,$n1) {
 $model = $model|0;
 $e = $e|0;
 $xq = $xq|0;
 $n1 = $n1|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0.0, $16 = 0.0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0.0, $25 = 0.0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0.0, $33 = 0.0, $34 = 0.0, $35 = 0.0, $36 = 0.0, $37 = 0.0, $38 = 0, $39 = 0, $4 = 0, $40 = 0.0, $41 = 0.0, $42 = 0, $43 = 0.0, $44 = 0;
 var $45 = 0, $46 = 0.0, $47 = 0.0, $48 = 0, $49 = 0.0, $5 = 0, $50 = 0, $51 = 0, $52 = 0.0, $53 = 0.0, $54 = 0.0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0.0, $61 = 0.0, $62 = 0.0;
 var $63 = 0.0, $64 = 0.0, $65 = 0, $7 = 0, $8 = 0, $9 = 0, $Wo_max = 0.0, $Wo_min = 0.0, $codebook1 = 0, $i = 0, $ndim = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $model;
 $1 = $e;
 $2 = $xq;
 $3 = $n1;
 $4 = HEAP32[(2180)>>2]|0;
 $codebook1 = $4;
 $5 = HEAP32[542]|0;
 $ndim = $5;
 $Wo_min = 0.039269909262657166;
 $Wo_max = 0.31415927410125732;
 $i = 0;
 while(1) {
  $6 = $i;
  $7 = $ndim;
  $8 = ($6|0)<($7|0);
  if (!($8)) {
   break;
  }
  $9 = $i;
  $10 = (50248 + ($9<<2)|0);
  $11 = +HEAPF32[$10>>2];
  $12 = $i;
  $13 = $2;
  $14 = (($13) + ($12<<2)|0);
  $15 = +HEAPF32[$14>>2];
  $16 = $11 * $15;
  $17 = $ndim;
  $18 = $3;
  $19 = Math_imul($17, $18)|0;
  $20 = $i;
  $21 = (($19) + ($20))|0;
  $22 = $codebook1;
  $23 = (($22) + ($21<<2)|0);
  $24 = +HEAPF32[$23>>2];
  $25 = $16 + $24;
  $26 = $i;
  $27 = $2;
  $28 = (($27) + ($26<<2)|0);
  HEAPF32[$28>>2] = $25;
  $29 = $i;
  $30 = (($29) + 1)|0;
  $i = $30;
 }
 $31 = $2;
 $32 = +HEAPF32[$31>>2];
 $33 = (+Math_pow(2.0,(+$32)));
 $34 = $33;
 $35 = $34 * 157.07963269999999;
 $36 = $35 / 4000.0;
 $37 = $36;
 $38 = $0;
 HEAPF32[$38>>2] = $37;
 $39 = $0;
 $40 = +HEAPF32[$39>>2];
 $41 = $Wo_max;
 $42 = $40 > $41;
 if ($42) {
  $43 = $Wo_max;
  $44 = $0;
  HEAPF32[$44>>2] = $43;
 }
 $45 = $0;
 $46 = +HEAPF32[$45>>2];
 $47 = $Wo_min;
 $48 = $46 < $47;
 if ($48) {
  $49 = $Wo_min;
  $50 = $0;
  HEAPF32[$50>>2] = $49;
 }
 $51 = $0;
 $52 = +HEAPF32[$51>>2];
 $53 = $52;
 $54 = 3.1415926540000001 / $53;
 $55 = (~~(($54)));
 $56 = $0;
 $57 = ((($56)) + 4|0);
 HEAP32[$57>>2] = $55;
 $58 = $2;
 $59 = ((($58)) + 4|0);
 $60 = +HEAPF32[$59>>2];
 $61 = $60;
 $62 = $61 / 10.0;
 $63 = $62;
 $64 = (+Math_pow(10.0,(+$63)));
 $65 = $1;
 HEAPF32[$65>>2] = $64;
 STACKTOP = sp;return;
}
function _make_analysis_window($fft_fwd_cfg,$w,$W) {
 $fft_fwd_cfg = $fft_fwd_cfg|0;
 $w = $w|0;
 $W = $W|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0.0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0.0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0.0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0.0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0.0, $128 = 0, $129 = 0, $13 = 0.0, $130 = 0, $131 = 0, $132 = 0, $133 = 0.0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0.0, $140 = 0, $15 = 0.0, $16 = 0.0, $17 = 0.0, $18 = 0.0, $19 = 0.0, $2 = 0, $20 = 0.0, $21 = 0.0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0.0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0.0, $33 = 0.0, $34 = 0.0, $35 = 0.0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0.0, $48 = 0.0, $49 = 0.0, $5 = 0, $50 = 0.0, $51 = 0.0, $52 = 0.0, $53 = 0, $54 = 0, $55 = 0.0, $56 = 0, $57 = 0, $58 = 0, $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0.0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0.0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $i = 0, $j = 0, $m = 0.0, $temp = 0, $wshift = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 4128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $wshift = sp + 16|0;
 $temp = sp + 8|0;
 $0 = $fft_fwd_cfg;
 $1 = $w;
 $2 = $W;
 $m = 0.0;
 $i = 0;
 while(1) {
  $3 = $i;
  $4 = ($3|0)<(21);
  if (!($4)) {
   break;
  }
  $5 = $i;
  $6 = $1;
  $7 = (($6) + ($5<<2)|0);
  HEAPF32[$7>>2] = 0.0;
  $8 = $i;
  $9 = (($8) + 1)|0;
  $i = $9;
 }
 $i = 21;
 $j = 0;
 while(1) {
  $10 = $i;
  $11 = ($10|0)<(299);
  if (!($11)) {
   break;
  }
  $12 = $j;
  $13 = (+($12|0));
  $14 = 6.2831853070000001 * $13;
  $15 = $14 / 278.0;
  $16 = $15;
  $17 = (+Math_cos((+$16)));
  $18 = $17;
  $19 = 0.5 * $18;
  $20 = 0.5 - $19;
  $21 = $20;
  $22 = $i;
  $23 = $1;
  $24 = (($23) + ($22<<2)|0);
  HEAPF32[$24>>2] = $21;
  $25 = $i;
  $26 = $1;
  $27 = (($26) + ($25<<2)|0);
  $28 = +HEAPF32[$27>>2];
  $29 = $i;
  $30 = $1;
  $31 = (($30) + ($29<<2)|0);
  $32 = +HEAPF32[$31>>2];
  $33 = $28 * $32;
  $34 = $m;
  $35 = $34 + $33;
  $m = $35;
  $36 = $i;
  $37 = (($36) + 1)|0;
  $i = $37;
  $38 = $j;
  $39 = (($38) + 1)|0;
  $j = $39;
 }
 $i = 299;
 while(1) {
  $40 = $i;
  $41 = ($40|0)<(320);
  if (!($41)) {
   break;
  }
  $42 = $i;
  $43 = $1;
  $44 = (($43) + ($42<<2)|0);
  HEAPF32[$44>>2] = 0.0;
  $45 = $i;
  $46 = (($45) + 1)|0;
  $i = $46;
 }
 $47 = $m;
 $48 = $47 * 512.0;
 $49 = (+Math_sqrt((+$48)));
 $50 = $49;
 $51 = 1.0 / $50;
 $52 = $51;
 $m = $52;
 $i = 0;
 while(1) {
  $53 = $i;
  $54 = ($53|0)<(320);
  if (!($54)) {
   break;
  }
  $55 = $m;
  $56 = $i;
  $57 = $1;
  $58 = (($57) + ($56<<2)|0);
  $59 = +HEAPF32[$58>>2];
  $60 = $59 * $55;
  HEAPF32[$58>>2] = $60;
  $61 = $i;
  $62 = (($61) + 1)|0;
  $i = $62;
 }
 $i = 0;
 while(1) {
  $63 = $i;
  $64 = ($63|0)<(512);
  if (!($64)) {
   break;
  }
  $65 = $i;
  $66 = (($wshift) + ($65<<3)|0);
  HEAPF32[$66>>2] = 0.0;
  $67 = $i;
  $68 = (($wshift) + ($67<<3)|0);
  $69 = ((($68)) + 4|0);
  HEAPF32[$69>>2] = 0.0;
  $70 = $i;
  $71 = (($70) + 1)|0;
  $i = $71;
 }
 $i = 0;
 while(1) {
  $72 = $i;
  $73 = ($72|0)<(139);
  if (!($73)) {
   break;
  }
  $74 = $i;
  $75 = (($74) + 160)|0;
  $76 = $1;
  $77 = (($76) + ($75<<2)|0);
  $78 = +HEAPF32[$77>>2];
  $79 = $i;
  $80 = (($wshift) + ($79<<3)|0);
  HEAPF32[$80>>2] = $78;
  $81 = $i;
  $82 = (($81) + 1)|0;
  $i = $82;
 }
 $i = 373;
 $j = 21;
 while(1) {
  $83 = $i;
  $84 = ($83|0)<(512);
  if (!($84)) {
   break;
  }
  $85 = $j;
  $86 = $1;
  $87 = (($86) + ($85<<2)|0);
  $88 = +HEAPF32[$87>>2];
  $89 = $i;
  $90 = (($wshift) + ($89<<3)|0);
  HEAPF32[$90>>2] = $88;
  $91 = $i;
  $92 = (($91) + 1)|0;
  $i = $92;
  $93 = $j;
  $94 = (($93) + 1)|0;
  $j = $94;
 }
 $95 = $0;
 $96 = $2;
 _codec2_fft($95,$wshift,$96);
 $i = 0;
 while(1) {
  $97 = $i;
  $98 = ($97|0)<(256);
  if (!($98)) {
   break;
  }
  $99 = $i;
  $100 = $2;
  $101 = (($100) + ($99<<3)|0);
  $102 = +HEAPF32[$101>>2];
  HEAPF32[$temp>>2] = $102;
  $103 = $i;
  $104 = $2;
  $105 = (($104) + ($103<<3)|0);
  $106 = ((($105)) + 4|0);
  $107 = +HEAPF32[$106>>2];
  $108 = ((($temp)) + 4|0);
  HEAPF32[$108>>2] = $107;
  $109 = $i;
  $110 = (($109) + 256)|0;
  $111 = $2;
  $112 = (($111) + ($110<<3)|0);
  $113 = +HEAPF32[$112>>2];
  $114 = $i;
  $115 = $2;
  $116 = (($115) + ($114<<3)|0);
  HEAPF32[$116>>2] = $113;
  $117 = $i;
  $118 = (($117) + 256)|0;
  $119 = $2;
  $120 = (($119) + ($118<<3)|0);
  $121 = ((($120)) + 4|0);
  $122 = +HEAPF32[$121>>2];
  $123 = $i;
  $124 = $2;
  $125 = (($124) + ($123<<3)|0);
  $126 = ((($125)) + 4|0);
  HEAPF32[$126>>2] = $122;
  $127 = +HEAPF32[$temp>>2];
  $128 = $i;
  $129 = (($128) + 256)|0;
  $130 = $2;
  $131 = (($130) + ($129<<3)|0);
  HEAPF32[$131>>2] = $127;
  $132 = ((($temp)) + 4|0);
  $133 = +HEAPF32[$132>>2];
  $134 = $i;
  $135 = (($134) + 256)|0;
  $136 = $2;
  $137 = (($136) + ($135<<3)|0);
  $138 = ((($137)) + 4|0);
  HEAPF32[$138>>2] = $133;
  $139 = $i;
  $140 = (($139) + 1)|0;
  $i = $140;
 }
 STACKTOP = sp;return;
}
function _codec2_fft($cfg,$in,$out) {
 $cfg = $cfg|0;
 $in = $in|0;
 $out = $out|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $cfg;
 $1 = $in;
 $2 = $out;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 _kiss_fft($3,$4,$5);
 STACKTOP = sp;return;
}
function _make_synthesis_window($Pn) {
 $Pn = $Pn|0;
 var $0 = 0, $1 = 0, $10 = 0.0, $11 = 0, $12 = 0, $13 = 0, $14 = 0.0, $15 = 0.0, $16 = 0.0, $17 = 0.0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0.0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0.0, $34 = 0.0, $35 = 0.0, $36 = 0.0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i = 0, $win = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $Pn;
 $win = 0.0;
 $i = 0;
 while(1) {
  $1 = $i;
  $2 = ($1|0)<(0);
  if (!($2)) {
   break;
  }
  $3 = $i;
  $4 = $0;
  $5 = (($4) + ($3<<2)|0);
  HEAPF32[$5>>2] = 0.0;
  $6 = $i;
  $7 = (($6) + 1)|0;
  $i = $7;
 }
 $win = 0.0;
 $i = 0;
 while(1) {
  $8 = $i;
  $9 = ($8|0)<(80);
  if (!($9)) {
   break;
  }
  $10 = $win;
  $11 = $i;
  $12 = $0;
  $13 = (($12) + ($11<<2)|0);
  HEAPF32[$13>>2] = $10;
  $14 = $win;
  $15 = $14;
  $16 = $15 + 0.012500000000000001;
  $17 = $16;
  $win = $17;
  $18 = $i;
  $19 = (($18) + 1)|0;
  $i = $19;
 }
 $i = 80;
 while(1) {
  $20 = $i;
  $21 = ($20|0)<(80);
  if (!($21)) {
   break;
  }
  $22 = $i;
  $23 = $0;
  $24 = (($23) + ($22<<2)|0);
  HEAPF32[$24>>2] = 1.0;
  $25 = $i;
  $26 = (($25) + 1)|0;
  $i = $26;
 }
 $win = 1.0;
 $i = 80;
 while(1) {
  $27 = $i;
  $28 = ($27|0)<(160);
  if (!($28)) {
   break;
  }
  $29 = $win;
  $30 = $i;
  $31 = $0;
  $32 = (($31) + ($30<<2)|0);
  HEAPF32[$32>>2] = $29;
  $33 = $win;
  $34 = $33;
  $35 = $34 - 0.012500000000000001;
  $36 = $35;
  $win = $36;
  $37 = $i;
  $38 = (($37) + 1)|0;
  $i = $38;
 }
 $i = 160;
 while(1) {
  $39 = $i;
  $40 = ($39|0)<(160);
  if (!($40)) {
   break;
  }
  $41 = $i;
  $42 = $0;
  $43 = (($42) + ($41<<2)|0);
  HEAPF32[$43>>2] = 0.0;
  $44 = $i;
  $45 = (($44) + 1)|0;
  $i = $45;
 }
 STACKTOP = sp;return;
}
function _synthesise($fftr_inv_cfg,$Sn_,$model,$Pn,$shift) {
 $fftr_inv_cfg = $fftr_inv_cfg|0;
 $Sn_ = $Sn_|0;
 $model = $model|0;
 $Pn = $Pn|0;
 $shift = $shift|0;
 var $$ = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0.0, $105 = 0, $106 = 0, $107 = 0, $108 = 0.0, $109 = 0.0, $11 = 0, $110 = 0.0, $111 = 0, $112 = 0, $113 = 0, $114 = 0;
 var $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0.0, $123 = 0, $124 = 0, $125 = 0, $126 = 0.0, $127 = 0.0, $128 = 0.0, $129 = 0, $13 = 0.0, $130 = 0, $131 = 0, $132 = 0.0;
 var $133 = 0.0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0.0, $37 = 0, $38 = 0.0, $39 = 0.0, $4 = 0, $40 = 0.0, $41 = 0.0, $42 = 0.0, $43 = 0.0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0.0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0.0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0.0, $71 = 0.0, $72 = 0.0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0.0, $85 = 0, $86 = 0, $87 = 0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0.0, $91 = 0, $92 = 0, $93 = 0, $94 = 0.0, $95 = 0.0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $Sw_ = 0;
 var $b = 0, $i = 0, $j = 0, $l = 0, $sw_ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 4144|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $Sw_ = sp + 2048|0;
 $sw_ = sp;
 $0 = $fftr_inv_cfg;
 $1 = $Sn_;
 $2 = $model;
 $3 = $Pn;
 $4 = $shift;
 $5 = $4;
 $6 = ($5|0)!=(0);
 if ($6) {
  $i = 0;
  while(1) {
   $7 = $i;
   $8 = ($7|0)<(79);
   if (!($8)) {
    break;
   }
   $9 = $i;
   $10 = (($9) + 80)|0;
   $11 = $1;
   $12 = (($11) + ($10<<2)|0);
   $13 = +HEAPF32[$12>>2];
   $14 = $i;
   $15 = $1;
   $16 = (($15) + ($14<<2)|0);
   HEAPF32[$16>>2] = $13;
   $17 = $i;
   $18 = (($17) + 1)|0;
   $i = $18;
  }
  $19 = $1;
  $20 = ((($19)) + 316|0);
  HEAPF32[$20>>2] = 0.0;
 }
 $i = 0;
 while(1) {
  $21 = $i;
  $22 = ($21|0)<(257);
  if (!($22)) {
   break;
  }
  $23 = $i;
  $24 = (($Sw_) + ($23<<3)|0);
  HEAPF32[$24>>2] = 0.0;
  $25 = $i;
  $26 = (($Sw_) + ($25<<3)|0);
  $27 = ((($26)) + 4|0);
  HEAPF32[$27>>2] = 0.0;
  $28 = $i;
  $29 = (($28) + 1)|0;
  $i = $29;
 }
 $l = 1;
 while(1) {
  $30 = $l;
  $31 = $2;
  $32 = ((($31)) + 4|0);
  $33 = HEAP32[$32>>2]|0;
  $34 = ($30|0)<=($33|0);
  if (!($34)) {
   break;
  }
  $35 = $l;
  $36 = (+($35|0));
  $37 = $2;
  $38 = +HEAPF32[$37>>2];
  $39 = $36 * $38;
  $40 = $39 * 512.0;
  $41 = $40;
  $42 = $41 / 6.2831853070000001;
  $43 = $42 + 0.5;
  $44 = (~~(($43)));
  $b = $44;
  $45 = $b;
  $46 = ($45|0)>(255);
  $$ = $46 ? 255 : $44;
  $b = $$;
  $47 = $l;
  $48 = $2;
  $49 = ((($48)) + 8|0);
  $50 = (($49) + ($47<<2)|0);
  $51 = +HEAPF32[$50>>2];
  $52 = $l;
  $53 = $2;
  $54 = ((($53)) + 332|0);
  $55 = (($54) + ($52<<2)|0);
  $56 = +HEAPF32[$55>>2];
  $57 = (+Math_cos((+$56)));
  $58 = $51 * $57;
  $59 = $b;
  $60 = (($Sw_) + ($59<<3)|0);
  HEAPF32[$60>>2] = $58;
  $61 = $l;
  $62 = $2;
  $63 = ((($62)) + 8|0);
  $64 = (($63) + ($61<<2)|0);
  $65 = +HEAPF32[$64>>2];
  $66 = $l;
  $67 = $2;
  $68 = ((($67)) + 332|0);
  $69 = (($68) + ($66<<2)|0);
  $70 = +HEAPF32[$69>>2];
  $71 = (+Math_sin((+$70)));
  $72 = $65 * $71;
  $73 = $b;
  $74 = (($Sw_) + ($73<<3)|0);
  $75 = ((($74)) + 4|0);
  HEAPF32[$75>>2] = $72;
  $76 = $l;
  $77 = (($76) + 1)|0;
  $l = $77;
 }
 $78 = $0;
 _codec2_fftri($78,$Sw_,$sw_);
 $i = 0;
 while(1) {
  $79 = $i;
  $80 = ($79|0)<(79);
  if (!($80)) {
   break;
  }
  $81 = $i;
  $82 = (433 + ($81))|0;
  $83 = (($sw_) + ($82<<2)|0);
  $84 = +HEAPF32[$83>>2];
  $85 = $i;
  $86 = $3;
  $87 = (($86) + ($85<<2)|0);
  $88 = +HEAPF32[$87>>2];
  $89 = $84 * $88;
  $90 = $89 * 1.0;
  $91 = $i;
  $92 = $1;
  $93 = (($92) + ($91<<2)|0);
  $94 = +HEAPF32[$93>>2];
  $95 = $94 + $90;
  HEAPF32[$93>>2] = $95;
  $96 = $i;
  $97 = (($96) + 1)|0;
  $i = $97;
 }
 $98 = $4;
 $99 = ($98|0)!=(0);
 $i = 79;
 $j = 0;
 if ($99) {
  while(1) {
   $100 = $i;
   $101 = ($100|0)<(160);
   if (!($101)) {
    break;
   }
   $102 = $j;
   $103 = (($sw_) + ($102<<2)|0);
   $104 = +HEAPF32[$103>>2];
   $105 = $i;
   $106 = $3;
   $107 = (($106) + ($105<<2)|0);
   $108 = +HEAPF32[$107>>2];
   $109 = $104 * $108;
   $110 = $109 * 1.0;
   $111 = $i;
   $112 = $1;
   $113 = (($112) + ($111<<2)|0);
   HEAPF32[$113>>2] = $110;
   $114 = $i;
   $115 = (($114) + 1)|0;
   $i = $115;
   $116 = $j;
   $117 = (($116) + 1)|0;
   $j = $117;
  }
  STACKTOP = sp;return;
 } else {
  while(1) {
   $118 = $i;
   $119 = ($118|0)<(160);
   if (!($119)) {
    break;
   }
   $120 = $j;
   $121 = (($sw_) + ($120<<2)|0);
   $122 = +HEAPF32[$121>>2];
   $123 = $i;
   $124 = $3;
   $125 = (($124) + ($123<<2)|0);
   $126 = +HEAPF32[$125>>2];
   $127 = $122 * $126;
   $128 = $127 * 1.0;
   $129 = $i;
   $130 = $1;
   $131 = (($130) + ($129<<2)|0);
   $132 = +HEAPF32[$131>>2];
   $133 = $132 + $128;
   HEAPF32[$131>>2] = $133;
   $134 = $i;
   $135 = (($134) + 1)|0;
   $i = $135;
   $136 = $j;
   $137 = (($136) + 1)|0;
   $j = $137;
  }
  STACKTOP = sp;return;
 }
}
function _codec2_fftri($cfg,$in,$out) {
 $cfg = $cfg|0;
 $in = $in|0;
 $out = $out|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $cfg;
 $1 = $in;
 $2 = $out;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 _kiss_fftri($3,$4,$5);
 STACKTOP = sp;return;
}
function _codec2_rand() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[12564]|0;
 $1 = Math_imul($0, 1103515245)|0;
 $2 = (($1) + 12345)|0;
 HEAP32[12564] = $2;
 $3 = HEAP32[12564]|0;
 $4 = (($3>>>0) / 65536)&-1;
 $5 = (($4>>>0) % 32768)&-1;
 return ($5|0);
}
function ___stdio_close($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $0 = ((($f)) + 60|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$vararg_buffer>>2] = $1;
 $2 = (___syscall6(6,($vararg_buffer|0))|0);
 $3 = (___syscall_ret($2)|0);
 STACKTOP = sp;return ($3|0);
}
function ___syscall_ret($r) {
 $r = $r|0;
 var $$0 = 0, $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($r>>>0)>(4294963200);
 if ($0) {
  $1 = (0 - ($r))|0;
  $2 = (___errno_location()|0);
  HEAP32[$2>>2] = $1;
  $$0 = -1;
 } else {
  $$0 = $r;
 }
 return ($$0|0);
}
function ___errno_location() {
 var $$0 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[13426]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $$0 = 53748;
 } else {
  $2 = (_pthread_self()|0);
  $3 = ((($2)) + 64|0);
  $4 = HEAP32[$3>>2]|0;
  $$0 = $4;
 }
 return ($$0|0);
}
function ___stdio_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $$0 = 0, $$phi$trans$insert = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $cnt$0 = 0, $cnt$1 = 0, $iov$0 = 0, $iov$0$lcssa11 = 0, $iov$1 = 0, $iovcnt$0 = 0, $iovcnt$0$lcssa12 = 0;
 var $iovcnt$1 = 0, $iovs = 0, $rem$0 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $iovs = sp + 32|0;
 $0 = ((($f)) + 28|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$iovs>>2] = $1;
 $2 = ((($iovs)) + 4|0);
 $3 = ((($f)) + 20|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = (($4) - ($1))|0;
 HEAP32[$2>>2] = $5;
 $6 = ((($iovs)) + 8|0);
 HEAP32[$6>>2] = $buf;
 $7 = ((($iovs)) + 12|0);
 HEAP32[$7>>2] = $len;
 $8 = (($5) + ($len))|0;
 $9 = ((($f)) + 60|0);
 $10 = ((($f)) + 44|0);
 $iov$0 = $iovs;$iovcnt$0 = 2;$rem$0 = $8;
 while(1) {
  $11 = HEAP32[13426]|0;
  $12 = ($11|0)==(0|0);
  if ($12) {
   $16 = HEAP32[$9>>2]|0;
   HEAP32[$vararg_buffer3>>2] = $16;
   $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
   HEAP32[$vararg_ptr6>>2] = $iov$0;
   $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
   HEAP32[$vararg_ptr7>>2] = $iovcnt$0;
   $17 = (___syscall146(146,($vararg_buffer3|0))|0);
   $18 = (___syscall_ret($17)|0);
   $cnt$0 = $18;
  } else {
   _pthread_cleanup_push((5|0),($f|0));
   $13 = HEAP32[$9>>2]|0;
   HEAP32[$vararg_buffer>>2] = $13;
   $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
   HEAP32[$vararg_ptr1>>2] = $iov$0;
   $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
   HEAP32[$vararg_ptr2>>2] = $iovcnt$0;
   $14 = (___syscall146(146,($vararg_buffer|0))|0);
   $15 = (___syscall_ret($14)|0);
   _pthread_cleanup_pop(0);
   $cnt$0 = $15;
  }
  $19 = ($rem$0|0)==($cnt$0|0);
  if ($19) {
   label = 6;
   break;
  }
  $26 = ($cnt$0|0)<(0);
  if ($26) {
   $iov$0$lcssa11 = $iov$0;$iovcnt$0$lcssa12 = $iovcnt$0;
   label = 8;
   break;
  }
  $34 = (($rem$0) - ($cnt$0))|0;
  $35 = ((($iov$0)) + 4|0);
  $36 = HEAP32[$35>>2]|0;
  $37 = ($cnt$0>>>0)>($36>>>0);
  if ($37) {
   $38 = HEAP32[$10>>2]|0;
   HEAP32[$0>>2] = $38;
   HEAP32[$3>>2] = $38;
   $39 = (($cnt$0) - ($36))|0;
   $40 = ((($iov$0)) + 8|0);
   $41 = (($iovcnt$0) + -1)|0;
   $$phi$trans$insert = ((($iov$0)) + 12|0);
   $$pre = HEAP32[$$phi$trans$insert>>2]|0;
   $49 = $$pre;$cnt$1 = $39;$iov$1 = $40;$iovcnt$1 = $41;
  } else {
   $42 = ($iovcnt$0|0)==(2);
   if ($42) {
    $43 = HEAP32[$0>>2]|0;
    $44 = (($43) + ($cnt$0)|0);
    HEAP32[$0>>2] = $44;
    $49 = $36;$cnt$1 = $cnt$0;$iov$1 = $iov$0;$iovcnt$1 = 2;
   } else {
    $49 = $36;$cnt$1 = $cnt$0;$iov$1 = $iov$0;$iovcnt$1 = $iovcnt$0;
   }
  }
  $45 = HEAP32[$iov$1>>2]|0;
  $46 = (($45) + ($cnt$1)|0);
  HEAP32[$iov$1>>2] = $46;
  $47 = ((($iov$1)) + 4|0);
  $48 = (($49) - ($cnt$1))|0;
  HEAP32[$47>>2] = $48;
  $iov$0 = $iov$1;$iovcnt$0 = $iovcnt$1;$rem$0 = $34;
 }
 if ((label|0) == 6) {
  $20 = HEAP32[$10>>2]|0;
  $21 = ((($f)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($f)) + 16|0);
  HEAP32[$24>>2] = $23;
  $25 = $20;
  HEAP32[$0>>2] = $25;
  HEAP32[$3>>2] = $25;
  $$0 = $len;
 }
 else if ((label|0) == 8) {
  $27 = ((($f)) + 16|0);
  HEAP32[$27>>2] = 0;
  HEAP32[$0>>2] = 0;
  HEAP32[$3>>2] = 0;
  $28 = HEAP32[$f>>2]|0;
  $29 = $28 | 32;
  HEAP32[$f>>2] = $29;
  $30 = ($iovcnt$0$lcssa12|0)==(2);
  if ($30) {
   $$0 = 0;
  } else {
   $31 = ((($iov$0$lcssa11)) + 4|0);
   $32 = HEAP32[$31>>2]|0;
   $33 = (($len) - ($32))|0;
   $$0 = $33;
  }
 }
 STACKTOP = sp;return ($$0|0);
}
function _cleanup_599($p) {
 $p = $p|0;
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($p)) + 68|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0);
 if ($2) {
  ___unlockfile($p);
 }
 return;
}
function ___unlockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___stdio_seek($f,$off,$whence) {
 $f = $f|0;
 $off = $off|0;
 $whence = $whence|0;
 var $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $ret = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $ret = sp + 20|0;
 $0 = ((($f)) + 60|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$vararg_buffer>>2] = $1;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $off;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $ret;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $whence;
 $2 = (___syscall140(140,($vararg_buffer|0))|0);
 $3 = (___syscall_ret($2)|0);
 $4 = ($3|0)<(0);
 if ($4) {
  HEAP32[$ret>>2] = -1;
  $5 = -1;
 } else {
  $$pre = HEAP32[$ret>>2]|0;
  $5 = $$pre;
 }
 STACKTOP = sp;return ($5|0);
}
function ___stdout_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $tio = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $tio = sp + 12|0;
 $0 = ((($f)) + 36|0);
 HEAP32[$0>>2] = 2;
 $1 = HEAP32[$f>>2]|0;
 $2 = $1 & 64;
 $3 = ($2|0)==(0);
 if ($3) {
  $4 = ((($f)) + 60|0);
  $5 = HEAP32[$4>>2]|0;
  HEAP32[$vararg_buffer>>2] = $5;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21505;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $tio;
  $6 = (___syscall54(54,($vararg_buffer|0))|0);
  $7 = ($6|0)==(0);
  if (!($7)) {
   $8 = ((($f)) + 75|0);
   HEAP8[$8>>0] = -1;
  }
 }
 $9 = (___stdio_write($f,$buf,$len)|0);
 STACKTOP = sp;return ($9|0);
}
function _frexpl($x,$e) {
 $x = +$x;
 $e = $e|0;
 var $0 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (+_frexp($x,$e));
 return (+$0);
}
function _frexp($x,$e) {
 $x = +$x;
 $e = $e|0;
 var $$0 = 0.0, $$01 = 0.0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0.0, $7 = 0.0, $8 = 0, $9 = 0, $storemerge = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $x;$0 = HEAP32[tempDoublePtr>>2]|0;
 $1 = HEAP32[tempDoublePtr+4>>2]|0;
 $2 = (_bitshift64Lshr(($0|0),($1|0),52)|0);
 $3 = tempRet0;
 $4 = $2 & 2047;
 switch ($4|0) {
 case 0:  {
  $5 = $x != 0.0;
  if ($5) {
   $6 = $x * 1.8446744073709552E+19;
   $7 = (+_frexp($6,$e));
   $8 = HEAP32[$e>>2]|0;
   $9 = (($8) + -64)|0;
   $$01 = $7;$storemerge = $9;
  } else {
   $$01 = $x;$storemerge = 0;
  }
  HEAP32[$e>>2] = $storemerge;
  $$0 = $$01;
  break;
 }
 case 2047:  {
  $$0 = $x;
  break;
 }
 default: {
  $10 = (($4) + -1022)|0;
  HEAP32[$e>>2] = $10;
  $11 = $1 & -2146435073;
  $12 = $11 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $0;HEAP32[tempDoublePtr+4>>2] = $12;$13 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $13;
 }
 }
 return (+$$0);
}
function _log10f($x) {
 $x = +$x;
 var $$0 = 0.0, $$mask = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0.0, $18 = 0.0, $19 = 0.0, $2 = 0, $20 = 0.0, $21 = 0.0, $22 = 0.0, $23 = 0.0, $24 = 0.0;
 var $25 = 0.0, $26 = 0.0, $27 = 0.0, $28 = 0.0, $29 = 0.0, $3 = 0, $30 = 0.0, $31 = 0.0, $32 = 0.0, $33 = 0, $34 = 0, $35 = 0.0, $36 = 0.0, $37 = 0.0, $38 = 0.0, $39 = 0.0, $4 = 0.0, $40 = 0.0, $41 = 0.0, $42 = 0.0;
 var $43 = 0.0, $44 = 0.0, $45 = 0.0, $46 = 0.0, $47 = 0.0, $48 = 0.0, $49 = 0.0, $5 = 0.0, $50 = 0.0, $51 = 0.0, $6 = 0.0, $7 = 0.0, $8 = 0.0, $9 = 0, $fabs = 0.0, $ix$0 = 0, $k$0 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (HEAPF32[tempDoublePtr>>2]=$x,HEAP32[tempDoublePtr>>2]|0);
 $1 = ($0>>>0)<(8388608);
 $2 = ($0|0)<(0);
 $or$cond = $1 | $2;
 do {
  if ($or$cond) {
   $fabs = (+Math_abs((+$x)));
   $$mask = (HEAPF32[tempDoublePtr>>2]=$fabs,HEAP32[tempDoublePtr>>2]|0);
   $3 = ($$mask|0)==(0);
   if ($3) {
    $4 = $x * $x;
    $5 = -1.0 / $4;
    $$0 = $5;
    break;
   }
   if ($2) {
    $6 = $x - $x;
    $7 = $6 / 0.0;
    $$0 = $7;
    break;
   } else {
    $8 = $x * 33554432.0;
    $9 = (HEAPF32[tempDoublePtr>>2]=$8,HEAP32[tempDoublePtr>>2]|0);
    $ix$0 = $9;$k$0 = -152;
    label = 9;
    break;
   }
  } else {
   $10 = ($0>>>0)>(2139095039);
   if ($10) {
    $$0 = $x;
   } else {
    $11 = ($0|0)==(1065353216);
    if ($11) {
     $$0 = 0.0;
    } else {
     $ix$0 = $0;$k$0 = -127;
     label = 9;
    }
   }
  }
 } while(0);
 if ((label|0) == 9) {
  $12 = (($ix$0) + 4913933)|0;
  $13 = $12 >>> 23;
  $14 = (($k$0) + ($13))|0;
  $15 = $12 & 8388607;
  $16 = (($15) + 1060439283)|0;
  $17 = (HEAP32[tempDoublePtr>>2]=$16,+HEAPF32[tempDoublePtr>>2]);
  $18 = $17 + -1.0;
  $19 = $18 + 2.0;
  $20 = $18 / $19;
  $21 = $20 * $20;
  $22 = $21 * $21;
  $23 = $22 * 0.24279078841209412;
  $24 = $23 + 0.40000972151756287;
  $25 = $22 * $24;
  $26 = $22 * 0.28498786687850952;
  $27 = $26 + 0.66666662693023682;
  $28 = $21 * $27;
  $29 = $28 + $25;
  $30 = $18 * 0.5;
  $31 = $18 * $30;
  $32 = $18 - $31;
  $33 = (HEAPF32[tempDoublePtr>>2]=$32,HEAP32[tempDoublePtr>>2]|0);
  $34 = $33 & -4096;
  $35 = (HEAP32[tempDoublePtr>>2]=$34,+HEAPF32[tempDoublePtr>>2]);
  $36 = $18 - $35;
  $37 = $36 - $31;
  $38 = $31 + $29;
  $39 = $20 * $38;
  $40 = $37 + $39;
  $41 = (+($14|0));
  $42 = $41 * 7.9034151667656261E-7;
  $43 = $35 + $40;
  $44 = $43 * 3.1689971365267411E-5;
  $45 = $42 - $44;
  $46 = $40 * 0.434326171875;
  $47 = $46 + $45;
  $48 = $35 * 0.434326171875;
  $49 = $48 + $47;
  $50 = $41 * 0.30102920532226563;
  $51 = $50 + $49;
  $$0 = $51;
 }
 return (+$$0);
}
function _vfprintf($f,$fmt,$ap) {
 $f = $f|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 var $$ = 0, $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $ap2 = 0, $internal_buf = 0, $nl_arg = 0, $nl_type = 0;
 var $ret$1 = 0, $ret$1$ = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $ap2 = sp + 120|0;
 $nl_type = sp + 80|0;
 $nl_arg = sp;
 $internal_buf = sp + 136|0;
 dest=$nl_type; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$ap>>2]|0;
 HEAP32[$ap2>>2] = $vacopy_currentptr;
 $0 = (_printf_core(0,$fmt,$ap2,$nl_arg,$nl_type)|0);
 $1 = ($0|0)<(0);
 if ($1) {
  $$0 = -1;
 } else {
  $2 = ((($f)) + 76|0);
  $3 = HEAP32[$2>>2]|0;
  $4 = ($3|0)>(-1);
  if ($4) {
   $5 = (___lockfile($f)|0);
   $33 = $5;
  } else {
   $33 = 0;
  }
  $6 = HEAP32[$f>>2]|0;
  $7 = $6 & 32;
  $8 = ((($f)) + 74|0);
  $9 = HEAP8[$8>>0]|0;
  $10 = ($9<<24>>24)<(1);
  if ($10) {
   $11 = $6 & -33;
   HEAP32[$f>>2] = $11;
  }
  $12 = ((($f)) + 48|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($13|0)==(0);
  if ($14) {
   $16 = ((($f)) + 44|0);
   $17 = HEAP32[$16>>2]|0;
   HEAP32[$16>>2] = $internal_buf;
   $18 = ((($f)) + 28|0);
   HEAP32[$18>>2] = $internal_buf;
   $19 = ((($f)) + 20|0);
   HEAP32[$19>>2] = $internal_buf;
   HEAP32[$12>>2] = 80;
   $20 = ((($internal_buf)) + 80|0);
   $21 = ((($f)) + 16|0);
   HEAP32[$21>>2] = $20;
   $22 = (_printf_core($f,$fmt,$ap2,$nl_arg,$nl_type)|0);
   $23 = ($17|0)==(0|0);
   if ($23) {
    $ret$1 = $22;
   } else {
    $24 = ((($f)) + 36|0);
    $25 = HEAP32[$24>>2]|0;
    (FUNCTION_TABLE_iiii[$25 & 7]($f,0,0)|0);
    $26 = HEAP32[$19>>2]|0;
    $27 = ($26|0)==(0|0);
    $$ = $27 ? -1 : $22;
    HEAP32[$16>>2] = $17;
    HEAP32[$12>>2] = 0;
    HEAP32[$21>>2] = 0;
    HEAP32[$18>>2] = 0;
    HEAP32[$19>>2] = 0;
    $ret$1 = $$;
   }
  } else {
   $15 = (_printf_core($f,$fmt,$ap2,$nl_arg,$nl_type)|0);
   $ret$1 = $15;
  }
  $28 = HEAP32[$f>>2]|0;
  $29 = $28 & 32;
  $30 = ($29|0)==(0);
  $ret$1$ = $30 ? $ret$1 : -1;
  $31 = $28 | $7;
  HEAP32[$f>>2] = $31;
  $32 = ($33|0)==(0);
  if (!($32)) {
   ___unlockfile($f);
  }
  $$0 = $ret$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($f,$fmt,$ap,$nl_arg,$nl_type) {
 $f = $f|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 $nl_arg = $nl_arg|0;
 $nl_type = $nl_type|0;
 var $$ = 0, $$$i = 0, $$0 = 0, $$0$i = 0, $$0$lcssa$i = 0, $$012$i = 0, $$013$i = 0, $$03$i33 = 0, $$07$i = 0.0, $$1$i = 0.0, $$114$i = 0, $$2$i = 0.0, $$20$i = 0.0, $$210$$24$i = 0, $$210$$26$i = 0, $$210$i = 0, $$23$i = 0, $$25$i = 0, $$3$i = 0.0, $$311$i = 0;
 var $$33$i = 0, $$36$i = 0.0, $$4$i = 0.0, $$412$lcssa$i = 0, $$41278$i = 0, $$43 = 0, $$5$lcssa$i = 0, $$589$i = 0, $$a$3$i = 0, $$a$3191$i = 0, $$a$3192$i = 0, $$fl$4 = 0, $$l10n$0 = 0, $$lcssa = 0, $$lcssa162$i = 0, $$lcssa295 = 0, $$lcssa300 = 0, $$lcssa301 = 0, $$lcssa302 = 0, $$lcssa303 = 0;
 var $$lcssa304 = 0, $$lcssa306 = 0, $$lcssa316 = 0, $$lcssa319 = 0.0, $$lcssa321 = 0, $$neg55$i = 0, $$neg56$i = 0, $$p$$i = 0, $$p$5 = 0, $$p$i = 0, $$pn$i = 0, $$pr$i = 0, $$pr50$i = 0, $$pre = 0, $$pre$i = 0, $$pre$phi190$iZ2D = 0, $$pre170 = 0, $$pre171 = 0, $$pre185$i = 0, $$pre188$i = 0;
 var $$pre189$i = 0, $$z$3$i = 0, $$z$4$i = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0;
 var $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0;
 var $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0;
 var $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0;
 var $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0;
 var $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0;
 var $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0;
 var $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0;
 var $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0;
 var $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0;
 var $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0;
 var $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0;
 var $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0;
 var $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0;
 var $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0.0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0.0, $363 = 0, $364 = 0, $365 = 0;
 var $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0;
 var $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0.0, $391 = 0.0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0;
 var $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0.0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0.0, $411 = 0.0, $412 = 0.0, $413 = 0.0, $414 = 0.0, $415 = 0.0, $416 = 0, $417 = 0, $418 = 0, $419 = 0;
 var $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0;
 var $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0.0, $442 = 0.0, $443 = 0.0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0;
 var $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0;
 var $474 = 0.0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0.0, $483 = 0.0, $484 = 0.0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0;
 var $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0;
 var $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0;
 var $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0;
 var $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0;
 var $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0;
 var $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0.0, $594 = 0.0, $595 = 0, $596 = 0.0, $597 = 0, $598 = 0, $599 = 0, $6 = 0;
 var $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0;
 var $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0;
 var $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0;
 var $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0;
 var $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0;
 var $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0;
 var $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0;
 var $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0;
 var $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0;
 var $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0;
 var $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, $a$0 = 0, $a$1 = 0, $a$1$lcssa$i = 0, $a$1149$i = 0, $a$2 = 0, $a$2$ph$i = 0, $a$3$lcssa$i = 0, $a$3136$i = 0, $a$5$lcssa$i = 0, $a$5111$i = 0, $a$6$i = 0, $a$8$i = 0, $a$9$ph$i = 0, $arg = 0, $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0;
 var $argpos$0 = 0, $big$i = 0, $buf = 0, $buf$i = 0, $carry$0142$i = 0, $carry3$0130$i = 0, $cnt$0 = 0, $cnt$1 = 0, $cnt$1$lcssa = 0, $d$0$i = 0, $d$0141$i = 0, $d$0143$i = 0, $d$1129$i = 0, $d$2$lcssa$i = 0, $d$2110$i = 0, $d$4$i = 0, $d$584$i = 0, $d$677$i = 0, $d$788$i = 0, $e$0125$i = 0;
 var $e$1$i = 0, $e$2106$i = 0, $e$4$i = 0, $e$5$ph$i = 0, $e2$i = 0, $ebuf0$i = 0, $estr$0$i = 0, $estr$1$lcssa$i = 0, $estr$195$i = 0, $estr$2$i = 0, $exitcond$i = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0;
 var $expanded8 = 0, $fl$0100 = 0, $fl$053 = 0, $fl$1 = 0, $fl$1$ = 0, $fl$3 = 0, $fl$4 = 0, $fl$6 = 0, $i$0$lcssa = 0, $i$0$lcssa178 = 0, $i$0105 = 0, $i$0124$i = 0, $i$03$i = 0, $i$03$i25 = 0, $i$1$lcssa$i = 0, $i$1116 = 0, $i$1118$i = 0, $i$2105$i = 0, $i$291 = 0, $i$291$lcssa = 0;
 var $i$3101$i = 0, $i$389 = 0, $isdigit = 0, $isdigit$i = 0, $isdigit$i27 = 0, $isdigit10 = 0, $isdigit12 = 0, $isdigit2$i = 0, $isdigit2$i23 = 0, $isdigittmp = 0, $isdigittmp$ = 0, $isdigittmp$i = 0, $isdigittmp$i26 = 0, $isdigittmp1$i = 0, $isdigittmp1$i22 = 0, $isdigittmp11 = 0, $isdigittmp4$i = 0, $isdigittmp4$i24 = 0, $isdigittmp9 = 0, $j$0$i = 0;
 var $j$0117$i = 0, $j$0119$i = 0, $j$1102$i = 0, $j$2$i = 0, $l$0 = 0, $l$0$i = 0, $l$1$i = 0, $l$1104 = 0, $l$2 = 0, $l10n$0 = 0, $l10n$0$lcssa = 0, $l10n$0$phi = 0, $l10n$1 = 0, $l10n$2 = 0, $l10n$3 = 0, $mb = 0, $notlhs$i = 0, $notrhs$i = 0, $or$cond = 0, $or$cond$i = 0;
 var $or$cond122 = 0, $or$cond15 = 0, $or$cond17 = 0, $or$cond18$i = 0, $or$cond20 = 0, $or$cond22$i = 0, $or$cond3$not$i = 0, $or$cond31$i = 0, $or$cond6$i = 0, $p$0 = 0, $p$0$ = 0, $p$1 = 0, $p$2 = 0, $p$2$ = 0, $p$3 = 0, $p$4176 = 0, $p$5 = 0, $pl$0 = 0, $pl$0$i = 0, $pl$1 = 0;
 var $pl$1$i = 0, $pl$2 = 0, $prefix$0 = 0, $prefix$0$$i = 0, $prefix$0$i = 0, $prefix$1 = 0, $prefix$2 = 0, $r$0$a$9$i = 0, $re$171$i = 0, $round$070$i = 0.0, $round6$1$i = 0.0, $s$0 = 0, $s$0$i = 0, $s$1 = 0, $s$1$i = 0, $s$1$i$lcssa = 0, $s$2$lcssa = 0, $s$292 = 0, $s$4 = 0, $s$6 = 0;
 var $s$7 = 0, $s$7$lcssa298 = 0, $s1$0$i = 0, $s7$081$i = 0, $s7$1$i = 0, $s8$0$lcssa$i = 0, $s8$072$i = 0, $s9$0$i = 0, $s9$185$i = 0, $s9$2$i = 0, $scevgep182$i = 0, $scevgep182183$i = 0, $small$0$i = 0.0, $small$1$i = 0.0, $st$0 = 0, $st$0$lcssa299 = 0, $storemerge = 0, $storemerge13 = 0, $storemerge851 = 0, $storemerge899 = 0;
 var $sum = 0, $t$0 = 0, $t$1 = 0, $w$$i = 0, $w$0 = 0, $w$1 = 0, $w$2 = 0, $w$32$i = 0, $wc = 0, $ws$0106 = 0, $ws$1117 = 0, $z$0$i = 0, $z$0$lcssa = 0, $z$093 = 0, $z$1 = 0, $z$1$lcssa$i = 0, $z$1148$i = 0, $z$2 = 0, $z$2$i = 0, $z$2$i$lcssa = 0;
 var $z$3$lcssa$i = 0, $z$3135$i = 0, $z$4$i = 0, $z$7$$i = 0, $z$7$i = 0, $z$7$i$lcssa = 0, $z$7$ph$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 624|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $big$i = sp + 24|0;
 $e2$i = sp + 16|0;
 $buf$i = sp + 588|0;
 $ebuf0$i = sp + 576|0;
 $arg = sp;
 $buf = sp + 536|0;
 $wc = sp + 8|0;
 $mb = sp + 528|0;
 $0 = ($f|0)!=(0|0);
 $1 = ((($buf)) + 40|0);
 $2 = $1;
 $3 = ((($buf)) + 39|0);
 $4 = ((($wc)) + 4|0);
 $5 = $buf$i;
 $6 = (0 - ($5))|0;
 $7 = ((($ebuf0$i)) + 12|0);
 $8 = ((($ebuf0$i)) + 11|0);
 $9 = $7;
 $10 = (($9) - ($5))|0;
 $11 = (-2 - ($5))|0;
 $12 = (($9) + 2)|0;
 $13 = ((($big$i)) + 288|0);
 $14 = ((($buf$i)) + 9|0);
 $15 = $14;
 $16 = ((($buf$i)) + 8|0);
 $cnt$0 = 0;$l$0 = 0;$l10n$0 = 0;$s$0 = $fmt;
 L1: while(1) {
  $17 = ($cnt$0|0)>(-1);
  do {
   if ($17) {
    $18 = (2147483647 - ($cnt$0))|0;
    $19 = ($l$0|0)>($18|0);
    if ($19) {
     $20 = (___errno_location()|0);
     HEAP32[$20>>2] = 75;
     $cnt$1 = -1;
     break;
    } else {
     $21 = (($l$0) + ($cnt$0))|0;
     $cnt$1 = $21;
     break;
    }
   } else {
    $cnt$1 = $cnt$0;
   }
  } while(0);
  $22 = HEAP8[$s$0>>0]|0;
  $23 = ($22<<24>>24)==(0);
  if ($23) {
   $cnt$1$lcssa = $cnt$1;$l10n$0$lcssa = $l10n$0;
   label = 244;
   break;
  } else {
   $24 = $22;$s$1 = $s$0;
  }
  L9: while(1) {
   switch ($24<<24>>24) {
   case 37:  {
    $s$292 = $s$1;$z$093 = $s$1;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $s$2$lcssa = $s$1;$z$0$lcssa = $s$1;
    break L9;
    break;
   }
   default: {
   }
   }
   $25 = ((($s$1)) + 1|0);
   $$pre = HEAP8[$25>>0]|0;
   $24 = $$pre;$s$1 = $25;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $26 = ((($s$292)) + 1|0);
     $27 = HEAP8[$26>>0]|0;
     $28 = ($27<<24>>24)==(37);
     if (!($28)) {
      $s$2$lcssa = $s$292;$z$0$lcssa = $z$093;
      break L12;
     }
     $29 = ((($z$093)) + 1|0);
     $30 = ((($s$292)) + 2|0);
     $31 = HEAP8[$30>>0]|0;
     $32 = ($31<<24>>24)==(37);
     if ($32) {
      $s$292 = $30;$z$093 = $29;
      label = 9;
     } else {
      $s$2$lcssa = $30;$z$0$lcssa = $29;
      break;
     }
    }
   }
  } while(0);
  $33 = $z$0$lcssa;
  $34 = $s$0;
  $35 = (($33) - ($34))|0;
  if ($0) {
   $36 = HEAP32[$f>>2]|0;
   $37 = $36 & 32;
   $38 = ($37|0)==(0);
   if ($38) {
    (___fwritex($s$0,$35,$f)|0);
   }
  }
  $39 = ($z$0$lcssa|0)==($s$0|0);
  if (!($39)) {
   $l10n$0$phi = $l10n$0;$cnt$0 = $cnt$1;$l$0 = $35;$s$0 = $s$2$lcssa;$l10n$0 = $l10n$0$phi;
   continue;
  }
  $40 = ((($s$2$lcssa)) + 1|0);
  $41 = HEAP8[$40>>0]|0;
  $42 = $41 << 24 >> 24;
  $isdigittmp = (($42) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $43 = ((($s$2$lcssa)) + 2|0);
   $44 = HEAP8[$43>>0]|0;
   $45 = ($44<<24>>24)==(36);
   $46 = ((($s$2$lcssa)) + 3|0);
   $$43 = $45 ? $46 : $40;
   $$l10n$0 = $45 ? 1 : $l10n$0;
   $isdigittmp$ = $45 ? $isdigittmp : -1;
   $$pre170 = HEAP8[$$43>>0]|0;
   $48 = $$pre170;$argpos$0 = $isdigittmp$;$l10n$1 = $$l10n$0;$storemerge = $$43;
  } else {
   $48 = $41;$argpos$0 = -1;$l10n$1 = $l10n$0;$storemerge = $40;
  }
  $47 = $48 << 24 >> 24;
  $49 = $47 & -32;
  $50 = ($49|0)==(32);
  L25: do {
   if ($50) {
    $52 = $47;$57 = $48;$fl$0100 = 0;$storemerge899 = $storemerge;
    while(1) {
     $51 = (($52) + -32)|0;
     $53 = 1 << $51;
     $54 = $53 & 75913;
     $55 = ($54|0)==(0);
     if ($55) {
      $67 = $57;$fl$053 = $fl$0100;$storemerge851 = $storemerge899;
      break L25;
     }
     $56 = $57 << 24 >> 24;
     $58 = (($56) + -32)|0;
     $59 = 1 << $58;
     $60 = $59 | $fl$0100;
     $61 = ((($storemerge899)) + 1|0);
     $62 = HEAP8[$61>>0]|0;
     $63 = $62 << 24 >> 24;
     $64 = $63 & -32;
     $65 = ($64|0)==(32);
     if ($65) {
      $52 = $63;$57 = $62;$fl$0100 = $60;$storemerge899 = $61;
     } else {
      $67 = $62;$fl$053 = $60;$storemerge851 = $61;
      break;
     }
    }
   } else {
    $67 = $48;$fl$053 = 0;$storemerge851 = $storemerge;
   }
  } while(0);
  $66 = ($67<<24>>24)==(42);
  do {
   if ($66) {
    $68 = ((($storemerge851)) + 1|0);
    $69 = HEAP8[$68>>0]|0;
    $70 = $69 << 24 >> 24;
    $isdigittmp11 = (($70) + -48)|0;
    $isdigit12 = ($isdigittmp11>>>0)<(10);
    if ($isdigit12) {
     $71 = ((($storemerge851)) + 2|0);
     $72 = HEAP8[$71>>0]|0;
     $73 = ($72<<24>>24)==(36);
     if ($73) {
      $74 = (($nl_type) + ($isdigittmp11<<2)|0);
      HEAP32[$74>>2] = 10;
      $75 = HEAP8[$68>>0]|0;
      $76 = $75 << 24 >> 24;
      $77 = (($76) + -48)|0;
      $78 = (($nl_arg) + ($77<<3)|0);
      $79 = $78;
      $80 = $79;
      $81 = HEAP32[$80>>2]|0;
      $82 = (($79) + 4)|0;
      $83 = $82;
      $84 = HEAP32[$83>>2]|0;
      $85 = ((($storemerge851)) + 3|0);
      $l10n$2 = 1;$storemerge13 = $85;$w$0 = $81;
     } else {
      label = 24;
     }
    } else {
     label = 24;
    }
    if ((label|0) == 24) {
     label = 0;
     $86 = ($l10n$1|0)==(0);
     if (!($86)) {
      $$0 = -1;
      break L1;
     }
     if (!($0)) {
      $fl$1 = $fl$053;$l10n$3 = 0;$s$4 = $68;$w$1 = 0;
      break;
     }
     $arglist_current = HEAP32[$ap>>2]|0;
     $87 = $arglist_current;
     $88 = ((0) + 4|0);
     $expanded4 = $88;
     $expanded = (($expanded4) - 1)|0;
     $89 = (($87) + ($expanded))|0;
     $90 = ((0) + 4|0);
     $expanded8 = $90;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $91 = $89 & $expanded6;
     $92 = $91;
     $93 = HEAP32[$92>>2]|0;
     $arglist_next = ((($92)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next;
     $l10n$2 = 0;$storemerge13 = $68;$w$0 = $93;
    }
    $94 = ($w$0|0)<(0);
    if ($94) {
     $95 = $fl$053 | 8192;
     $96 = (0 - ($w$0))|0;
     $fl$1 = $95;$l10n$3 = $l10n$2;$s$4 = $storemerge13;$w$1 = $96;
    } else {
     $fl$1 = $fl$053;$l10n$3 = $l10n$2;$s$4 = $storemerge13;$w$1 = $w$0;
    }
   } else {
    $97 = $67 << 24 >> 24;
    $isdigittmp1$i = (($97) + -48)|0;
    $isdigit2$i = ($isdigittmp1$i>>>0)<(10);
    if ($isdigit2$i) {
     $101 = $storemerge851;$i$03$i = 0;$isdigittmp4$i = $isdigittmp1$i;
     while(1) {
      $98 = ($i$03$i*10)|0;
      $99 = (($98) + ($isdigittmp4$i))|0;
      $100 = ((($101)) + 1|0);
      $102 = HEAP8[$100>>0]|0;
      $103 = $102 << 24 >> 24;
      $isdigittmp$i = (($103) + -48)|0;
      $isdigit$i = ($isdigittmp$i>>>0)<(10);
      if ($isdigit$i) {
       $101 = $100;$i$03$i = $99;$isdigittmp4$i = $isdigittmp$i;
      } else {
       $$lcssa = $99;$$lcssa295 = $100;
       break;
      }
     }
     $104 = ($$lcssa|0)<(0);
     if ($104) {
      $$0 = -1;
      break L1;
     } else {
      $fl$1 = $fl$053;$l10n$3 = $l10n$1;$s$4 = $$lcssa295;$w$1 = $$lcssa;
     }
    } else {
     $fl$1 = $fl$053;$l10n$3 = $l10n$1;$s$4 = $storemerge851;$w$1 = 0;
    }
   }
  } while(0);
  $105 = HEAP8[$s$4>>0]|0;
  $106 = ($105<<24>>24)==(46);
  L46: do {
   if ($106) {
    $107 = ((($s$4)) + 1|0);
    $108 = HEAP8[$107>>0]|0;
    $109 = ($108<<24>>24)==(42);
    if (!($109)) {
     $136 = $108 << 24 >> 24;
     $isdigittmp1$i22 = (($136) + -48)|0;
     $isdigit2$i23 = ($isdigittmp1$i22>>>0)<(10);
     if ($isdigit2$i23) {
      $140 = $107;$i$03$i25 = 0;$isdigittmp4$i24 = $isdigittmp1$i22;
     } else {
      $p$0 = 0;$s$6 = $107;
      break;
     }
     while(1) {
      $137 = ($i$03$i25*10)|0;
      $138 = (($137) + ($isdigittmp4$i24))|0;
      $139 = ((($140)) + 1|0);
      $141 = HEAP8[$139>>0]|0;
      $142 = $141 << 24 >> 24;
      $isdigittmp$i26 = (($142) + -48)|0;
      $isdigit$i27 = ($isdigittmp$i26>>>0)<(10);
      if ($isdigit$i27) {
       $140 = $139;$i$03$i25 = $138;$isdigittmp4$i24 = $isdigittmp$i26;
      } else {
       $p$0 = $138;$s$6 = $139;
       break L46;
      }
     }
    }
    $110 = ((($s$4)) + 2|0);
    $111 = HEAP8[$110>>0]|0;
    $112 = $111 << 24 >> 24;
    $isdigittmp9 = (($112) + -48)|0;
    $isdigit10 = ($isdigittmp9>>>0)<(10);
    if ($isdigit10) {
     $113 = ((($s$4)) + 3|0);
     $114 = HEAP8[$113>>0]|0;
     $115 = ($114<<24>>24)==(36);
     if ($115) {
      $116 = (($nl_type) + ($isdigittmp9<<2)|0);
      HEAP32[$116>>2] = 10;
      $117 = HEAP8[$110>>0]|0;
      $118 = $117 << 24 >> 24;
      $119 = (($118) + -48)|0;
      $120 = (($nl_arg) + ($119<<3)|0);
      $121 = $120;
      $122 = $121;
      $123 = HEAP32[$122>>2]|0;
      $124 = (($121) + 4)|0;
      $125 = $124;
      $126 = HEAP32[$125>>2]|0;
      $127 = ((($s$4)) + 4|0);
      $p$0 = $123;$s$6 = $127;
      break;
     }
    }
    $128 = ($l10n$3|0)==(0);
    if (!($128)) {
     $$0 = -1;
     break L1;
    }
    if ($0) {
     $arglist_current2 = HEAP32[$ap>>2]|0;
     $129 = $arglist_current2;
     $130 = ((0) + 4|0);
     $expanded11 = $130;
     $expanded10 = (($expanded11) - 1)|0;
     $131 = (($129) + ($expanded10))|0;
     $132 = ((0) + 4|0);
     $expanded15 = $132;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $133 = $131 & $expanded13;
     $134 = $133;
     $135 = HEAP32[$134>>2]|0;
     $arglist_next3 = ((($134)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next3;
     $p$0 = $135;$s$6 = $110;
    } else {
     $p$0 = 0;$s$6 = $110;
    }
   } else {
    $p$0 = -1;$s$6 = $s$4;
   }
  } while(0);
  $s$7 = $s$6;$st$0 = 0;
  while(1) {
   $143 = HEAP8[$s$7>>0]|0;
   $144 = $143 << 24 >> 24;
   $145 = (($144) + -65)|0;
   $146 = ($145>>>0)>(57);
   if ($146) {
    $$0 = -1;
    break L1;
   }
   $147 = ((($s$7)) + 1|0);
   $148 = ((51271 + (($st$0*58)|0)|0) + ($145)|0);
   $149 = HEAP8[$148>>0]|0;
   $150 = $149&255;
   $151 = (($150) + -1)|0;
   $152 = ($151>>>0)<(8);
   if ($152) {
    $s$7 = $147;$st$0 = $150;
   } else {
    $$lcssa300 = $147;$$lcssa301 = $149;$$lcssa302 = $150;$s$7$lcssa298 = $s$7;$st$0$lcssa299 = $st$0;
    break;
   }
  }
  $153 = ($$lcssa301<<24>>24)==(0);
  if ($153) {
   $$0 = -1;
   break;
  }
  $154 = ($$lcssa301<<24>>24)==(19);
  $155 = ($argpos$0|0)>(-1);
  do {
   if ($154) {
    if ($155) {
     $$0 = -1;
     break L1;
    } else {
     label = 52;
    }
   } else {
    if ($155) {
     $156 = (($nl_type) + ($argpos$0<<2)|0);
     HEAP32[$156>>2] = $$lcssa302;
     $157 = (($nl_arg) + ($argpos$0<<3)|0);
     $158 = $157;
     $159 = $158;
     $160 = HEAP32[$159>>2]|0;
     $161 = (($158) + 4)|0;
     $162 = $161;
     $163 = HEAP32[$162>>2]|0;
     $164 = $arg;
     $165 = $164;
     HEAP32[$165>>2] = $160;
     $166 = (($164) + 4)|0;
     $167 = $166;
     HEAP32[$167>>2] = $163;
     label = 52;
     break;
    }
    if (!($0)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg($arg,$$lcssa302,$ap);
   }
  } while(0);
  if ((label|0) == 52) {
   label = 0;
   if (!($0)) {
    $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
    continue;
   }
  }
  $168 = HEAP8[$s$7$lcssa298>>0]|0;
  $169 = $168 << 24 >> 24;
  $170 = ($st$0$lcssa299|0)!=(0);
  $171 = $169 & 15;
  $172 = ($171|0)==(3);
  $or$cond15 = $170 & $172;
  $173 = $169 & -33;
  $t$0 = $or$cond15 ? $173 : $169;
  $174 = $fl$1 & 8192;
  $175 = ($174|0)==(0);
  $176 = $fl$1 & -65537;
  $fl$1$ = $175 ? $fl$1 : $176;
  L75: do {
   switch ($t$0|0) {
   case 110:  {
    switch ($st$0$lcssa299|0) {
    case 0:  {
     $183 = HEAP32[$arg>>2]|0;
     HEAP32[$183>>2] = $cnt$1;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 1:  {
     $184 = HEAP32[$arg>>2]|0;
     HEAP32[$184>>2] = $cnt$1;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 2:  {
     $185 = ($cnt$1|0)<(0);
     $186 = $185 << 31 >> 31;
     $187 = HEAP32[$arg>>2]|0;
     $188 = $187;
     $189 = $188;
     HEAP32[$189>>2] = $cnt$1;
     $190 = (($188) + 4)|0;
     $191 = $190;
     HEAP32[$191>>2] = $186;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 3:  {
     $192 = $cnt$1&65535;
     $193 = HEAP32[$arg>>2]|0;
     HEAP16[$193>>1] = $192;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 4:  {
     $194 = $cnt$1&255;
     $195 = HEAP32[$arg>>2]|0;
     HEAP8[$195>>0] = $194;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 6:  {
     $196 = HEAP32[$arg>>2]|0;
     HEAP32[$196>>2] = $cnt$1;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 7:  {
     $197 = ($cnt$1|0)<(0);
     $198 = $197 << 31 >> 31;
     $199 = HEAP32[$arg>>2]|0;
     $200 = $199;
     $201 = $200;
     HEAP32[$201>>2] = $cnt$1;
     $202 = (($200) + 4)|0;
     $203 = $202;
     HEAP32[$203>>2] = $198;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    default: {
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $204 = ($p$0>>>0)>(8);
    $205 = $204 ? $p$0 : 8;
    $206 = $fl$1$ | 8;
    $fl$3 = $206;$p$1 = $205;$t$1 = 120;
    label = 64;
    break;
   }
   case 88: case 120:  {
    $fl$3 = $fl$1$;$p$1 = $p$0;$t$1 = $t$0;
    label = 64;
    break;
   }
   case 111:  {
    $244 = $arg;
    $245 = $244;
    $246 = HEAP32[$245>>2]|0;
    $247 = (($244) + 4)|0;
    $248 = $247;
    $249 = HEAP32[$248>>2]|0;
    $250 = ($246|0)==(0);
    $251 = ($249|0)==(0);
    $252 = $250 & $251;
    if ($252) {
     $$0$lcssa$i = $1;
    } else {
     $$03$i33 = $1;$254 = $246;$258 = $249;
     while(1) {
      $253 = $254 & 7;
      $255 = $253 | 48;
      $256 = $255&255;
      $257 = ((($$03$i33)) + -1|0);
      HEAP8[$257>>0] = $256;
      $259 = (_bitshift64Lshr(($254|0),($258|0),3)|0);
      $260 = tempRet0;
      $261 = ($259|0)==(0);
      $262 = ($260|0)==(0);
      $263 = $261 & $262;
      if ($263) {
       $$0$lcssa$i = $257;
       break;
      } else {
       $$03$i33 = $257;$254 = $259;$258 = $260;
      }
     }
    }
    $264 = $fl$1$ & 8;
    $265 = ($264|0)==(0);
    if ($265) {
     $a$0 = $$0$lcssa$i;$fl$4 = $fl$1$;$p$2 = $p$0;$pl$1 = 0;$prefix$1 = 51751;
     label = 77;
    } else {
     $266 = $$0$lcssa$i;
     $267 = (($2) - ($266))|0;
     $268 = ($p$0|0)>($267|0);
     $269 = (($267) + 1)|0;
     $p$0$ = $268 ? $p$0 : $269;
     $a$0 = $$0$lcssa$i;$fl$4 = $fl$1$;$p$2 = $p$0$;$pl$1 = 0;$prefix$1 = 51751;
     label = 77;
    }
    break;
   }
   case 105: case 100:  {
    $270 = $arg;
    $271 = $270;
    $272 = HEAP32[$271>>2]|0;
    $273 = (($270) + 4)|0;
    $274 = $273;
    $275 = HEAP32[$274>>2]|0;
    $276 = ($275|0)<(0);
    if ($276) {
     $277 = (_i64Subtract(0,0,($272|0),($275|0))|0);
     $278 = tempRet0;
     $279 = $arg;
     $280 = $279;
     HEAP32[$280>>2] = $277;
     $281 = (($279) + 4)|0;
     $282 = $281;
     HEAP32[$282>>2] = $278;
     $287 = $277;$288 = $278;$pl$0 = 1;$prefix$0 = 51751;
     label = 76;
     break L75;
    }
    $283 = $fl$1$ & 2048;
    $284 = ($283|0)==(0);
    if ($284) {
     $285 = $fl$1$ & 1;
     $286 = ($285|0)==(0);
     $$ = $286 ? 51751 : (51753);
     $287 = $272;$288 = $275;$pl$0 = $285;$prefix$0 = $$;
     label = 76;
    } else {
     $287 = $272;$288 = $275;$pl$0 = 1;$prefix$0 = (51752);
     label = 76;
    }
    break;
   }
   case 117:  {
    $177 = $arg;
    $178 = $177;
    $179 = HEAP32[$178>>2]|0;
    $180 = (($177) + 4)|0;
    $181 = $180;
    $182 = HEAP32[$181>>2]|0;
    $287 = $179;$288 = $182;$pl$0 = 0;$prefix$0 = 51751;
    label = 76;
    break;
   }
   case 99:  {
    $308 = $arg;
    $309 = $308;
    $310 = HEAP32[$309>>2]|0;
    $311 = (($308) + 4)|0;
    $312 = $311;
    $313 = HEAP32[$312>>2]|0;
    $314 = $310&255;
    HEAP8[$3>>0] = $314;
    $a$2 = $3;$fl$6 = $176;$p$5 = 1;$pl$2 = 0;$prefix$2 = 51751;$z$2 = $1;
    break;
   }
   case 109:  {
    $315 = (___errno_location()|0);
    $316 = HEAP32[$315>>2]|0;
    $317 = (_strerror($316)|0);
    $a$1 = $317;
    label = 82;
    break;
   }
   case 115:  {
    $318 = HEAP32[$arg>>2]|0;
    $319 = ($318|0)!=(0|0);
    $320 = $319 ? $318 : 53653;
    $a$1 = $320;
    label = 82;
    break;
   }
   case 67:  {
    $327 = $arg;
    $328 = $327;
    $329 = HEAP32[$328>>2]|0;
    $330 = (($327) + 4)|0;
    $331 = $330;
    $332 = HEAP32[$331>>2]|0;
    HEAP32[$wc>>2] = $329;
    HEAP32[$4>>2] = 0;
    HEAP32[$arg>>2] = $wc;
    $798 = $wc;$p$4176 = -1;
    label = 86;
    break;
   }
   case 83:  {
    $$pre171 = HEAP32[$arg>>2]|0;
    $333 = ($p$0|0)==(0);
    if ($333) {
     _pad($f,32,$w$1,0,$fl$1$);
     $i$0$lcssa178 = 0;
     label = 97;
    } else {
     $798 = $$pre171;$p$4176 = $p$0;
     label = 86;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $358 = +HEAPF64[$arg>>3];
    HEAP32[$e2$i>>2] = 0;
    HEAPF64[tempDoublePtr>>3] = $358;$359 = HEAP32[tempDoublePtr>>2]|0;
    $360 = HEAP32[tempDoublePtr+4>>2]|0;
    $361 = ($360|0)<(0);
    if ($361) {
     $362 = -$358;
     $$07$i = $362;$pl$0$i = 1;$prefix$0$i = 53660;
    } else {
     $363 = $fl$1$ & 2048;
     $364 = ($363|0)==(0);
     if ($364) {
      $365 = $fl$1$ & 1;
      $366 = ($365|0)==(0);
      $$$i = $366 ? (53661) : (53666);
      $$07$i = $358;$pl$0$i = $365;$prefix$0$i = $$$i;
     } else {
      $$07$i = $358;$pl$0$i = 1;$prefix$0$i = (53663);
     }
    }
    HEAPF64[tempDoublePtr>>3] = $$07$i;$367 = HEAP32[tempDoublePtr>>2]|0;
    $368 = HEAP32[tempDoublePtr+4>>2]|0;
    $369 = $368 & 2146435072;
    $370 = ($369>>>0)<(2146435072);
    $371 = (0)<(0);
    $372 = ($369|0)==(2146435072);
    $373 = $372 & $371;
    $374 = $370 | $373;
    do {
     if ($374) {
      $390 = (+_frexpl($$07$i,$e2$i));
      $391 = $390 * 2.0;
      $392 = $391 != 0.0;
      if ($392) {
       $393 = HEAP32[$e2$i>>2]|0;
       $394 = (($393) + -1)|0;
       HEAP32[$e2$i>>2] = $394;
      }
      $395 = $t$0 | 32;
      $396 = ($395|0)==(97);
      if ($396) {
       $397 = $t$0 & 32;
       $398 = ($397|0)==(0);
       $399 = ((($prefix$0$i)) + 9|0);
       $prefix$0$$i = $398 ? $prefix$0$i : $399;
       $400 = $pl$0$i | 2;
       $401 = ($p$0>>>0)>(11);
       $402 = (12 - ($p$0))|0;
       $403 = ($402|0)==(0);
       $404 = $401 | $403;
       do {
        if ($404) {
         $$1$i = $391;
        } else {
         $re$171$i = $402;$round$070$i = 8.0;
         while(1) {
          $405 = (($re$171$i) + -1)|0;
          $406 = $round$070$i * 16.0;
          $407 = ($405|0)==(0);
          if ($407) {
           $$lcssa319 = $406;
           break;
          } else {
           $re$171$i = $405;$round$070$i = $406;
          }
         }
         $408 = HEAP8[$prefix$0$$i>>0]|0;
         $409 = ($408<<24>>24)==(45);
         if ($409) {
          $410 = -$391;
          $411 = $410 - $$lcssa319;
          $412 = $$lcssa319 + $411;
          $413 = -$412;
          $$1$i = $413;
          break;
         } else {
          $414 = $391 + $$lcssa319;
          $415 = $414 - $$lcssa319;
          $$1$i = $415;
          break;
         }
        }
       } while(0);
       $416 = HEAP32[$e2$i>>2]|0;
       $417 = ($416|0)<(0);
       $418 = (0 - ($416))|0;
       $419 = $417 ? $418 : $416;
       $420 = ($419|0)<(0);
       $421 = $420 << 31 >> 31;
       $422 = (_fmt_u($419,$421,$7)|0);
       $423 = ($422|0)==($7|0);
       if ($423) {
        HEAP8[$8>>0] = 48;
        $estr$0$i = $8;
       } else {
        $estr$0$i = $422;
       }
       $424 = $416 >> 31;
       $425 = $424 & 2;
       $426 = (($425) + 43)|0;
       $427 = $426&255;
       $428 = ((($estr$0$i)) + -1|0);
       HEAP8[$428>>0] = $427;
       $429 = (($t$0) + 15)|0;
       $430 = $429&255;
       $431 = ((($estr$0$i)) + -2|0);
       HEAP8[$431>>0] = $430;
       $notrhs$i = ($p$0|0)<(1);
       $432 = $fl$1$ & 8;
       $433 = ($432|0)==(0);
       $$2$i = $$1$i;$s$0$i = $buf$i;
       while(1) {
        $434 = (~~(($$2$i)));
        $435 = (51735 + ($434)|0);
        $436 = HEAP8[$435>>0]|0;
        $437 = $436&255;
        $438 = $437 | $397;
        $439 = $438&255;
        $440 = ((($s$0$i)) + 1|0);
        HEAP8[$s$0$i>>0] = $439;
        $441 = (+($434|0));
        $442 = $$2$i - $441;
        $443 = $442 * 16.0;
        $444 = $440;
        $445 = (($444) - ($5))|0;
        $446 = ($445|0)==(1);
        do {
         if ($446) {
          $notlhs$i = $443 == 0.0;
          $or$cond3$not$i = $notrhs$i & $notlhs$i;
          $or$cond$i = $433 & $or$cond3$not$i;
          if ($or$cond$i) {
           $s$1$i = $440;
           break;
          }
          $447 = ((($s$0$i)) + 2|0);
          HEAP8[$440>>0] = 46;
          $s$1$i = $447;
         } else {
          $s$1$i = $440;
         }
        } while(0);
        $448 = $443 != 0.0;
        if ($448) {
         $$2$i = $443;$s$0$i = $s$1$i;
        } else {
         $s$1$i$lcssa = $s$1$i;
         break;
        }
       }
       $449 = ($p$0|0)!=(0);
       $$pre188$i = $s$1$i$lcssa;
       $450 = (($11) + ($$pre188$i))|0;
       $451 = ($450|0)<($p$0|0);
       $or$cond122 = $449 & $451;
       $452 = $431;
       $453 = (($12) + ($p$0))|0;
       $454 = (($453) - ($452))|0;
       $455 = (($10) - ($452))|0;
       $456 = (($455) + ($$pre188$i))|0;
       $l$0$i = $or$cond122 ? $454 : $456;
       $457 = (($l$0$i) + ($400))|0;
       _pad($f,32,$w$1,$457,$fl$1$);
       $458 = HEAP32[$f>>2]|0;
       $459 = $458 & 32;
       $460 = ($459|0)==(0);
       if ($460) {
        (___fwritex($prefix$0$$i,$400,$f)|0);
       }
       $461 = $fl$1$ ^ 65536;
       _pad($f,48,$w$1,$457,$461);
       $462 = (($$pre188$i) - ($5))|0;
       $463 = HEAP32[$f>>2]|0;
       $464 = $463 & 32;
       $465 = ($464|0)==(0);
       if ($465) {
        (___fwritex($buf$i,$462,$f)|0);
       }
       $466 = (($9) - ($452))|0;
       $sum = (($462) + ($466))|0;
       $467 = (($l$0$i) - ($sum))|0;
       _pad($f,48,$467,0,0);
       $468 = HEAP32[$f>>2]|0;
       $469 = $468 & 32;
       $470 = ($469|0)==(0);
       if ($470) {
        (___fwritex($431,$466,$f)|0);
       }
       $471 = $fl$1$ ^ 8192;
       _pad($f,32,$w$1,$457,$471);
       $472 = ($457|0)<($w$1|0);
       $w$$i = $472 ? $w$1 : $457;
       $$0$i = $w$$i;
       break;
      }
      $473 = ($p$0|0)<(0);
      $$p$i = $473 ? 6 : $p$0;
      if ($392) {
       $474 = $391 * 268435456.0;
       $475 = HEAP32[$e2$i>>2]|0;
       $476 = (($475) + -28)|0;
       HEAP32[$e2$i>>2] = $476;
       $$3$i = $474;$478 = $476;
      } else {
       $$pre185$i = HEAP32[$e2$i>>2]|0;
       $$3$i = $391;$478 = $$pre185$i;
      }
      $477 = ($478|0)<(0);
      $$33$i = $477 ? $big$i : $13;
      $479 = $$33$i;
      $$4$i = $$3$i;$z$0$i = $$33$i;
      while(1) {
       $480 = (~~(($$4$i))>>>0);
       HEAP32[$z$0$i>>2] = $480;
       $481 = ((($z$0$i)) + 4|0);
       $482 = (+($480>>>0));
       $483 = $$4$i - $482;
       $484 = $483 * 1.0E+9;
       $485 = $484 != 0.0;
       if ($485) {
        $$4$i = $484;$z$0$i = $481;
       } else {
        $$lcssa303 = $481;
        break;
       }
      }
      $$pr$i = HEAP32[$e2$i>>2]|0;
      $486 = ($$pr$i|0)>(0);
      if ($486) {
       $488 = $$pr$i;$a$1149$i = $$33$i;$z$1148$i = $$lcssa303;
       while(1) {
        $487 = ($488|0)>(29);
        $489 = $487 ? 29 : $488;
        $d$0141$i = ((($z$1148$i)) + -4|0);
        $490 = ($d$0141$i>>>0)<($a$1149$i>>>0);
        do {
         if ($490) {
          $a$2$ph$i = $a$1149$i;
         } else {
          $carry$0142$i = 0;$d$0143$i = $d$0141$i;
          while(1) {
           $491 = HEAP32[$d$0143$i>>2]|0;
           $492 = (_bitshift64Shl(($491|0),0,($489|0))|0);
           $493 = tempRet0;
           $494 = (_i64Add(($492|0),($493|0),($carry$0142$i|0),0)|0);
           $495 = tempRet0;
           $496 = (___uremdi3(($494|0),($495|0),1000000000,0)|0);
           $497 = tempRet0;
           HEAP32[$d$0143$i>>2] = $496;
           $498 = (___udivdi3(($494|0),($495|0),1000000000,0)|0);
           $499 = tempRet0;
           $d$0$i = ((($d$0143$i)) + -4|0);
           $500 = ($d$0$i>>>0)<($a$1149$i>>>0);
           if ($500) {
            $$lcssa304 = $498;
            break;
           } else {
            $carry$0142$i = $498;$d$0143$i = $d$0$i;
           }
          }
          $501 = ($$lcssa304|0)==(0);
          if ($501) {
           $a$2$ph$i = $a$1149$i;
           break;
          }
          $502 = ((($a$1149$i)) + -4|0);
          HEAP32[$502>>2] = $$lcssa304;
          $a$2$ph$i = $502;
         }
        } while(0);
        $z$2$i = $z$1148$i;
        while(1) {
         $503 = ($z$2$i>>>0)>($a$2$ph$i>>>0);
         if (!($503)) {
          $z$2$i$lcssa = $z$2$i;
          break;
         }
         $504 = ((($z$2$i)) + -4|0);
         $505 = HEAP32[$504>>2]|0;
         $506 = ($505|0)==(0);
         if ($506) {
          $z$2$i = $504;
         } else {
          $z$2$i$lcssa = $z$2$i;
          break;
         }
        }
        $507 = HEAP32[$e2$i>>2]|0;
        $508 = (($507) - ($489))|0;
        HEAP32[$e2$i>>2] = $508;
        $509 = ($508|0)>(0);
        if ($509) {
         $488 = $508;$a$1149$i = $a$2$ph$i;$z$1148$i = $z$2$i$lcssa;
        } else {
         $$pr50$i = $508;$a$1$lcssa$i = $a$2$ph$i;$z$1$lcssa$i = $z$2$i$lcssa;
         break;
        }
       }
      } else {
       $$pr50$i = $$pr$i;$a$1$lcssa$i = $$33$i;$z$1$lcssa$i = $$lcssa303;
      }
      $510 = ($$pr50$i|0)<(0);
      if ($510) {
       $511 = (($$p$i) + 25)|0;
       $512 = (($511|0) / 9)&-1;
       $513 = (($512) + 1)|0;
       $514 = ($395|0)==(102);
       $516 = $$pr50$i;$a$3136$i = $a$1$lcssa$i;$z$3135$i = $z$1$lcssa$i;
       while(1) {
        $515 = (0 - ($516))|0;
        $517 = ($515|0)>(9);
        $518 = $517 ? 9 : $515;
        $519 = ($a$3136$i>>>0)<($z$3135$i>>>0);
        do {
         if ($519) {
          $523 = 1 << $518;
          $524 = (($523) + -1)|0;
          $525 = 1000000000 >>> $518;
          $carry3$0130$i = 0;$d$1129$i = $a$3136$i;
          while(1) {
           $526 = HEAP32[$d$1129$i>>2]|0;
           $527 = $526 & $524;
           $528 = $526 >>> $518;
           $529 = (($528) + ($carry3$0130$i))|0;
           HEAP32[$d$1129$i>>2] = $529;
           $530 = Math_imul($527, $525)|0;
           $531 = ((($d$1129$i)) + 4|0);
           $532 = ($531>>>0)<($z$3135$i>>>0);
           if ($532) {
            $carry3$0130$i = $530;$d$1129$i = $531;
           } else {
            $$lcssa306 = $530;
            break;
           }
          }
          $533 = HEAP32[$a$3136$i>>2]|0;
          $534 = ($533|0)==(0);
          $535 = ((($a$3136$i)) + 4|0);
          $$a$3$i = $534 ? $535 : $a$3136$i;
          $536 = ($$lcssa306|0)==(0);
          if ($536) {
           $$a$3192$i = $$a$3$i;$z$4$i = $z$3135$i;
           break;
          }
          $537 = ((($z$3135$i)) + 4|0);
          HEAP32[$z$3135$i>>2] = $$lcssa306;
          $$a$3192$i = $$a$3$i;$z$4$i = $537;
         } else {
          $520 = HEAP32[$a$3136$i>>2]|0;
          $521 = ($520|0)==(0);
          $522 = ((($a$3136$i)) + 4|0);
          $$a$3191$i = $521 ? $522 : $a$3136$i;
          $$a$3192$i = $$a$3191$i;$z$4$i = $z$3135$i;
         }
        } while(0);
        $538 = $514 ? $$33$i : $$a$3192$i;
        $539 = $z$4$i;
        $540 = $538;
        $541 = (($539) - ($540))|0;
        $542 = $541 >> 2;
        $543 = ($542|0)>($513|0);
        $544 = (($538) + ($513<<2)|0);
        $$z$4$i = $543 ? $544 : $z$4$i;
        $545 = HEAP32[$e2$i>>2]|0;
        $546 = (($545) + ($518))|0;
        HEAP32[$e2$i>>2] = $546;
        $547 = ($546|0)<(0);
        if ($547) {
         $516 = $546;$a$3136$i = $$a$3192$i;$z$3135$i = $$z$4$i;
        } else {
         $a$3$lcssa$i = $$a$3192$i;$z$3$lcssa$i = $$z$4$i;
         break;
        }
       }
      } else {
       $a$3$lcssa$i = $a$1$lcssa$i;$z$3$lcssa$i = $z$1$lcssa$i;
      }
      $548 = ($a$3$lcssa$i>>>0)<($z$3$lcssa$i>>>0);
      do {
       if ($548) {
        $549 = $a$3$lcssa$i;
        $550 = (($479) - ($549))|0;
        $551 = $550 >> 2;
        $552 = ($551*9)|0;
        $553 = HEAP32[$a$3$lcssa$i>>2]|0;
        $554 = ($553>>>0)<(10);
        if ($554) {
         $e$1$i = $552;
         break;
        } else {
         $e$0125$i = $552;$i$0124$i = 10;
        }
        while(1) {
         $555 = ($i$0124$i*10)|0;
         $556 = (($e$0125$i) + 1)|0;
         $557 = ($553>>>0)<($555>>>0);
         if ($557) {
          $e$1$i = $556;
          break;
         } else {
          $e$0125$i = $556;$i$0124$i = $555;
         }
        }
       } else {
        $e$1$i = 0;
       }
      } while(0);
      $558 = ($395|0)!=(102);
      $559 = $558 ? $e$1$i : 0;
      $560 = (($$p$i) - ($559))|0;
      $561 = ($395|0)==(103);
      $562 = ($$p$i|0)!=(0);
      $563 = $562 & $561;
      $$neg55$i = $563 << 31 >> 31;
      $564 = (($560) + ($$neg55$i))|0;
      $565 = $z$3$lcssa$i;
      $566 = (($565) - ($479))|0;
      $567 = $566 >> 2;
      $568 = ($567*9)|0;
      $569 = (($568) + -9)|0;
      $570 = ($564|0)<($569|0);
      if ($570) {
       $571 = ((($$33$i)) + 4|0);
       $572 = (($564) + 9216)|0;
       $573 = (($572|0) / 9)&-1;
       $574 = (($573) + -1024)|0;
       $575 = (($571) + ($574<<2)|0);
       $576 = (($572|0) % 9)&-1;
       $j$0117$i = (($576) + 1)|0;
       $577 = ($j$0117$i|0)<(9);
       if ($577) {
        $i$1118$i = 10;$j$0119$i = $j$0117$i;
        while(1) {
         $578 = ($i$1118$i*10)|0;
         $j$0$i = (($j$0119$i) + 1)|0;
         $exitcond$i = ($j$0$i|0)==(9);
         if ($exitcond$i) {
          $i$1$lcssa$i = $578;
          break;
         } else {
          $i$1118$i = $578;$j$0119$i = $j$0$i;
         }
        }
       } else {
        $i$1$lcssa$i = 10;
       }
       $579 = HEAP32[$575>>2]|0;
       $580 = (($579>>>0) % ($i$1$lcssa$i>>>0))&-1;
       $581 = ($580|0)==(0);
       $582 = ((($575)) + 4|0);
       $583 = ($582|0)==($z$3$lcssa$i|0);
       $or$cond18$i = $583 & $581;
       do {
        if ($or$cond18$i) {
         $a$8$i = $a$3$lcssa$i;$d$4$i = $575;$e$4$i = $e$1$i;
        } else {
         $584 = (($579>>>0) / ($i$1$lcssa$i>>>0))&-1;
         $585 = $584 & 1;
         $586 = ($585|0)==(0);
         $$20$i = $586 ? 9007199254740992.0 : 9007199254740994.0;
         $587 = (($i$1$lcssa$i|0) / 2)&-1;
         $588 = ($580>>>0)<($587>>>0);
         if ($588) {
          $small$0$i = 0.5;
         } else {
          $589 = ($580|0)==($587|0);
          $or$cond22$i = $583 & $589;
          $$36$i = $or$cond22$i ? 1.0 : 1.5;
          $small$0$i = $$36$i;
         }
         $590 = ($pl$0$i|0)==(0);
         do {
          if ($590) {
           $round6$1$i = $$20$i;$small$1$i = $small$0$i;
          } else {
           $591 = HEAP8[$prefix$0$i>>0]|0;
           $592 = ($591<<24>>24)==(45);
           if (!($592)) {
            $round6$1$i = $$20$i;$small$1$i = $small$0$i;
            break;
           }
           $593 = -$$20$i;
           $594 = -$small$0$i;
           $round6$1$i = $593;$small$1$i = $594;
          }
         } while(0);
         $595 = (($579) - ($580))|0;
         HEAP32[$575>>2] = $595;
         $596 = $round6$1$i + $small$1$i;
         $597 = $596 != $round6$1$i;
         if (!($597)) {
          $a$8$i = $a$3$lcssa$i;$d$4$i = $575;$e$4$i = $e$1$i;
          break;
         }
         $598 = (($595) + ($i$1$lcssa$i))|0;
         HEAP32[$575>>2] = $598;
         $599 = ($598>>>0)>(999999999);
         if ($599) {
          $a$5111$i = $a$3$lcssa$i;$d$2110$i = $575;
          while(1) {
           $600 = ((($d$2110$i)) + -4|0);
           HEAP32[$d$2110$i>>2] = 0;
           $601 = ($600>>>0)<($a$5111$i>>>0);
           if ($601) {
            $602 = ((($a$5111$i)) + -4|0);
            HEAP32[$602>>2] = 0;
            $a$6$i = $602;
           } else {
            $a$6$i = $a$5111$i;
           }
           $603 = HEAP32[$600>>2]|0;
           $604 = (($603) + 1)|0;
           HEAP32[$600>>2] = $604;
           $605 = ($604>>>0)>(999999999);
           if ($605) {
            $a$5111$i = $a$6$i;$d$2110$i = $600;
           } else {
            $a$5$lcssa$i = $a$6$i;$d$2$lcssa$i = $600;
            break;
           }
          }
         } else {
          $a$5$lcssa$i = $a$3$lcssa$i;$d$2$lcssa$i = $575;
         }
         $606 = $a$5$lcssa$i;
         $607 = (($479) - ($606))|0;
         $608 = $607 >> 2;
         $609 = ($608*9)|0;
         $610 = HEAP32[$a$5$lcssa$i>>2]|0;
         $611 = ($610>>>0)<(10);
         if ($611) {
          $a$8$i = $a$5$lcssa$i;$d$4$i = $d$2$lcssa$i;$e$4$i = $609;
          break;
         } else {
          $e$2106$i = $609;$i$2105$i = 10;
         }
         while(1) {
          $612 = ($i$2105$i*10)|0;
          $613 = (($e$2106$i) + 1)|0;
          $614 = ($610>>>0)<($612>>>0);
          if ($614) {
           $a$8$i = $a$5$lcssa$i;$d$4$i = $d$2$lcssa$i;$e$4$i = $613;
           break;
          } else {
           $e$2106$i = $613;$i$2105$i = $612;
          }
         }
        }
       } while(0);
       $615 = ((($d$4$i)) + 4|0);
       $616 = ($z$3$lcssa$i>>>0)>($615>>>0);
       $$z$3$i = $616 ? $615 : $z$3$lcssa$i;
       $a$9$ph$i = $a$8$i;$e$5$ph$i = $e$4$i;$z$7$ph$i = $$z$3$i;
      } else {
       $a$9$ph$i = $a$3$lcssa$i;$e$5$ph$i = $e$1$i;$z$7$ph$i = $z$3$lcssa$i;
      }
      $617 = (0 - ($e$5$ph$i))|0;
      $z$7$i = $z$7$ph$i;
      while(1) {
       $618 = ($z$7$i>>>0)>($a$9$ph$i>>>0);
       if (!($618)) {
        $$lcssa162$i = 0;$z$7$i$lcssa = $z$7$i;
        break;
       }
       $619 = ((($z$7$i)) + -4|0);
       $620 = HEAP32[$619>>2]|0;
       $621 = ($620|0)==(0);
       if ($621) {
        $z$7$i = $619;
       } else {
        $$lcssa162$i = 1;$z$7$i$lcssa = $z$7$i;
        break;
       }
      }
      do {
       if ($561) {
        $622 = $562&1;
        $623 = $622 ^ 1;
        $$p$$i = (($623) + ($$p$i))|0;
        $624 = ($$p$$i|0)>($e$5$ph$i|0);
        $625 = ($e$5$ph$i|0)>(-5);
        $or$cond6$i = $624 & $625;
        if ($or$cond6$i) {
         $626 = (($t$0) + -1)|0;
         $$neg56$i = (($$p$$i) + -1)|0;
         $627 = (($$neg56$i) - ($e$5$ph$i))|0;
         $$013$i = $626;$$210$i = $627;
        } else {
         $628 = (($t$0) + -2)|0;
         $629 = (($$p$$i) + -1)|0;
         $$013$i = $628;$$210$i = $629;
        }
        $630 = $fl$1$ & 8;
        $631 = ($630|0)==(0);
        if (!($631)) {
         $$114$i = $$013$i;$$311$i = $$210$i;$$pre$phi190$iZ2D = $630;
         break;
        }
        do {
         if ($$lcssa162$i) {
          $632 = ((($z$7$i$lcssa)) + -4|0);
          $633 = HEAP32[$632>>2]|0;
          $634 = ($633|0)==(0);
          if ($634) {
           $j$2$i = 9;
           break;
          }
          $635 = (($633>>>0) % 10)&-1;
          $636 = ($635|0)==(0);
          if ($636) {
           $i$3101$i = 10;$j$1102$i = 0;
          } else {
           $j$2$i = 0;
           break;
          }
          while(1) {
           $637 = ($i$3101$i*10)|0;
           $638 = (($j$1102$i) + 1)|0;
           $639 = (($633>>>0) % ($637>>>0))&-1;
           $640 = ($639|0)==(0);
           if ($640) {
            $i$3101$i = $637;$j$1102$i = $638;
           } else {
            $j$2$i = $638;
            break;
           }
          }
         } else {
          $j$2$i = 9;
         }
        } while(0);
        $641 = $$013$i | 32;
        $642 = ($641|0)==(102);
        $643 = $z$7$i$lcssa;
        $644 = (($643) - ($479))|0;
        $645 = $644 >> 2;
        $646 = ($645*9)|0;
        $647 = (($646) + -9)|0;
        if ($642) {
         $648 = (($647) - ($j$2$i))|0;
         $649 = ($648|0)<(0);
         $$23$i = $649 ? 0 : $648;
         $650 = ($$210$i|0)<($$23$i|0);
         $$210$$24$i = $650 ? $$210$i : $$23$i;
         $$114$i = $$013$i;$$311$i = $$210$$24$i;$$pre$phi190$iZ2D = 0;
         break;
        } else {
         $651 = (($647) + ($e$5$ph$i))|0;
         $652 = (($651) - ($j$2$i))|0;
         $653 = ($652|0)<(0);
         $$25$i = $653 ? 0 : $652;
         $654 = ($$210$i|0)<($$25$i|0);
         $$210$$26$i = $654 ? $$210$i : $$25$i;
         $$114$i = $$013$i;$$311$i = $$210$$26$i;$$pre$phi190$iZ2D = 0;
         break;
        }
       } else {
        $$pre189$i = $fl$1$ & 8;
        $$114$i = $t$0;$$311$i = $$p$i;$$pre$phi190$iZ2D = $$pre189$i;
       }
      } while(0);
      $655 = $$311$i | $$pre$phi190$iZ2D;
      $656 = ($655|0)!=(0);
      $657 = $656&1;
      $658 = $$114$i | 32;
      $659 = ($658|0)==(102);
      if ($659) {
       $660 = ($e$5$ph$i|0)>(0);
       $661 = $660 ? $e$5$ph$i : 0;
       $$pn$i = $661;$estr$2$i = 0;
      } else {
       $662 = ($e$5$ph$i|0)<(0);
       $663 = $662 ? $617 : $e$5$ph$i;
       $664 = ($663|0)<(0);
       $665 = $664 << 31 >> 31;
       $666 = (_fmt_u($663,$665,$7)|0);
       $667 = $666;
       $668 = (($9) - ($667))|0;
       $669 = ($668|0)<(2);
       if ($669) {
        $estr$195$i = $666;
        while(1) {
         $670 = ((($estr$195$i)) + -1|0);
         HEAP8[$670>>0] = 48;
         $671 = $670;
         $672 = (($9) - ($671))|0;
         $673 = ($672|0)<(2);
         if ($673) {
          $estr$195$i = $670;
         } else {
          $estr$1$lcssa$i = $670;
          break;
         }
        }
       } else {
        $estr$1$lcssa$i = $666;
       }
       $674 = $e$5$ph$i >> 31;
       $675 = $674 & 2;
       $676 = (($675) + 43)|0;
       $677 = $676&255;
       $678 = ((($estr$1$lcssa$i)) + -1|0);
       HEAP8[$678>>0] = $677;
       $679 = $$114$i&255;
       $680 = ((($estr$1$lcssa$i)) + -2|0);
       HEAP8[$680>>0] = $679;
       $681 = $680;
       $682 = (($9) - ($681))|0;
       $$pn$i = $682;$estr$2$i = $680;
      }
      $683 = (($pl$0$i) + 1)|0;
      $684 = (($683) + ($$311$i))|0;
      $l$1$i = (($684) + ($657))|0;
      $685 = (($l$1$i) + ($$pn$i))|0;
      _pad($f,32,$w$1,$685,$fl$1$);
      $686 = HEAP32[$f>>2]|0;
      $687 = $686 & 32;
      $688 = ($687|0)==(0);
      if ($688) {
       (___fwritex($prefix$0$i,$pl$0$i,$f)|0);
      }
      $689 = $fl$1$ ^ 65536;
      _pad($f,48,$w$1,$685,$689);
      do {
       if ($659) {
        $690 = ($a$9$ph$i>>>0)>($$33$i>>>0);
        $r$0$a$9$i = $690 ? $$33$i : $a$9$ph$i;
        $d$584$i = $r$0$a$9$i;
        while(1) {
         $691 = HEAP32[$d$584$i>>2]|0;
         $692 = (_fmt_u($691,0,$14)|0);
         $693 = ($d$584$i|0)==($r$0$a$9$i|0);
         do {
          if ($693) {
           $699 = ($692|0)==($14|0);
           if (!($699)) {
            $s7$1$i = $692;
            break;
           }
           HEAP8[$16>>0] = 48;
           $s7$1$i = $16;
          } else {
           $694 = ($692>>>0)>($buf$i>>>0);
           if (!($694)) {
            $s7$1$i = $692;
            break;
           }
           $695 = $692;
           $696 = (($695) - ($5))|0;
           _memset(($buf$i|0),48,($696|0))|0;
           $s7$081$i = $692;
           while(1) {
            $697 = ((($s7$081$i)) + -1|0);
            $698 = ($697>>>0)>($buf$i>>>0);
            if ($698) {
             $s7$081$i = $697;
            } else {
             $s7$1$i = $697;
             break;
            }
           }
          }
         } while(0);
         $700 = HEAP32[$f>>2]|0;
         $701 = $700 & 32;
         $702 = ($701|0)==(0);
         if ($702) {
          $703 = $s7$1$i;
          $704 = (($15) - ($703))|0;
          (___fwritex($s7$1$i,$704,$f)|0);
         }
         $705 = ((($d$584$i)) + 4|0);
         $706 = ($705>>>0)>($$33$i>>>0);
         if ($706) {
          $$lcssa316 = $705;
          break;
         } else {
          $d$584$i = $705;
         }
        }
        $707 = ($655|0)==(0);
        do {
         if (!($707)) {
          $708 = HEAP32[$f>>2]|0;
          $709 = $708 & 32;
          $710 = ($709|0)==(0);
          if (!($710)) {
           break;
          }
          (___fwritex(53695,1,$f)|0);
         }
        } while(0);
        $711 = ($$lcssa316>>>0)<($z$7$i$lcssa>>>0);
        $712 = ($$311$i|0)>(0);
        $713 = $712 & $711;
        if ($713) {
         $$41278$i = $$311$i;$d$677$i = $$lcssa316;
         while(1) {
          $714 = HEAP32[$d$677$i>>2]|0;
          $715 = (_fmt_u($714,0,$14)|0);
          $716 = ($715>>>0)>($buf$i>>>0);
          if ($716) {
           $717 = $715;
           $718 = (($717) - ($5))|0;
           _memset(($buf$i|0),48,($718|0))|0;
           $s8$072$i = $715;
           while(1) {
            $719 = ((($s8$072$i)) + -1|0);
            $720 = ($719>>>0)>($buf$i>>>0);
            if ($720) {
             $s8$072$i = $719;
            } else {
             $s8$0$lcssa$i = $719;
             break;
            }
           }
          } else {
           $s8$0$lcssa$i = $715;
          }
          $721 = HEAP32[$f>>2]|0;
          $722 = $721 & 32;
          $723 = ($722|0)==(0);
          if ($723) {
           $724 = ($$41278$i|0)>(9);
           $725 = $724 ? 9 : $$41278$i;
           (___fwritex($s8$0$lcssa$i,$725,$f)|0);
          }
          $726 = ((($d$677$i)) + 4|0);
          $727 = (($$41278$i) + -9)|0;
          $728 = ($726>>>0)<($z$7$i$lcssa>>>0);
          $729 = ($$41278$i|0)>(9);
          $730 = $729 & $728;
          if ($730) {
           $$41278$i = $727;$d$677$i = $726;
          } else {
           $$412$lcssa$i = $727;
           break;
          }
         }
        } else {
         $$412$lcssa$i = $$311$i;
        }
        $731 = (($$412$lcssa$i) + 9)|0;
        _pad($f,48,$731,9,0);
       } else {
        $732 = ((($a$9$ph$i)) + 4|0);
        $z$7$$i = $$lcssa162$i ? $z$7$i$lcssa : $732;
        $733 = ($$311$i|0)>(-1);
        if ($733) {
         $734 = ($$pre$phi190$iZ2D|0)==(0);
         $$589$i = $$311$i;$d$788$i = $a$9$ph$i;
         while(1) {
          $735 = HEAP32[$d$788$i>>2]|0;
          $736 = (_fmt_u($735,0,$14)|0);
          $737 = ($736|0)==($14|0);
          if ($737) {
           HEAP8[$16>>0] = 48;
           $s9$0$i = $16;
          } else {
           $s9$0$i = $736;
          }
          $738 = ($d$788$i|0)==($a$9$ph$i|0);
          do {
           if ($738) {
            $742 = ((($s9$0$i)) + 1|0);
            $743 = HEAP32[$f>>2]|0;
            $744 = $743 & 32;
            $745 = ($744|0)==(0);
            if ($745) {
             (___fwritex($s9$0$i,1,$f)|0);
            }
            $746 = ($$589$i|0)<(1);
            $or$cond31$i = $734 & $746;
            if ($or$cond31$i) {
             $s9$2$i = $742;
             break;
            }
            $747 = HEAP32[$f>>2]|0;
            $748 = $747 & 32;
            $749 = ($748|0)==(0);
            if (!($749)) {
             $s9$2$i = $742;
             break;
            }
            (___fwritex(53695,1,$f)|0);
            $s9$2$i = $742;
           } else {
            $739 = ($s9$0$i>>>0)>($buf$i>>>0);
            if (!($739)) {
             $s9$2$i = $s9$0$i;
             break;
            }
            $scevgep182$i = (($s9$0$i) + ($6)|0);
            $scevgep182183$i = $scevgep182$i;
            _memset(($buf$i|0),48,($scevgep182183$i|0))|0;
            $s9$185$i = $s9$0$i;
            while(1) {
             $740 = ((($s9$185$i)) + -1|0);
             $741 = ($740>>>0)>($buf$i>>>0);
             if ($741) {
              $s9$185$i = $740;
             } else {
              $s9$2$i = $740;
              break;
             }
            }
           }
          } while(0);
          $750 = $s9$2$i;
          $751 = (($15) - ($750))|0;
          $752 = HEAP32[$f>>2]|0;
          $753 = $752 & 32;
          $754 = ($753|0)==(0);
          if ($754) {
           $755 = ($$589$i|0)>($751|0);
           $756 = $755 ? $751 : $$589$i;
           (___fwritex($s9$2$i,$756,$f)|0);
          }
          $757 = (($$589$i) - ($751))|0;
          $758 = ((($d$788$i)) + 4|0);
          $759 = ($758>>>0)<($z$7$$i>>>0);
          $760 = ($757|0)>(-1);
          $761 = $759 & $760;
          if ($761) {
           $$589$i = $757;$d$788$i = $758;
          } else {
           $$5$lcssa$i = $757;
           break;
          }
         }
        } else {
         $$5$lcssa$i = $$311$i;
        }
        $762 = (($$5$lcssa$i) + 18)|0;
        _pad($f,48,$762,18,0);
        $763 = HEAP32[$f>>2]|0;
        $764 = $763 & 32;
        $765 = ($764|0)==(0);
        if (!($765)) {
         break;
        }
        $766 = $estr$2$i;
        $767 = (($9) - ($766))|0;
        (___fwritex($estr$2$i,$767,$f)|0);
       }
      } while(0);
      $768 = $fl$1$ ^ 8192;
      _pad($f,32,$w$1,$685,$768);
      $769 = ($685|0)<($w$1|0);
      $w$32$i = $769 ? $w$1 : $685;
      $$0$i = $w$32$i;
     } else {
      $375 = $t$0 & 32;
      $376 = ($375|0)!=(0);
      $377 = $376 ? 53679 : 53683;
      $378 = ($$07$i != $$07$i) | (0.0 != 0.0);
      $379 = $376 ? 53687 : 53691;
      $pl$1$i = $378 ? 0 : $pl$0$i;
      $s1$0$i = $378 ? $379 : $377;
      $380 = (($pl$1$i) + 3)|0;
      _pad($f,32,$w$1,$380,$176);
      $381 = HEAP32[$f>>2]|0;
      $382 = $381 & 32;
      $383 = ($382|0)==(0);
      if ($383) {
       (___fwritex($prefix$0$i,$pl$1$i,$f)|0);
       $$pre$i = HEAP32[$f>>2]|0;
       $385 = $$pre$i;
      } else {
       $385 = $381;
      }
      $384 = $385 & 32;
      $386 = ($384|0)==(0);
      if ($386) {
       (___fwritex($s1$0$i,3,$f)|0);
      }
      $387 = $fl$1$ ^ 8192;
      _pad($f,32,$w$1,$380,$387);
      $388 = ($380|0)<($w$1|0);
      $389 = $388 ? $w$1 : $380;
      $$0$i = $389;
     }
    } while(0);
    $cnt$0 = $cnt$1;$l$0 = $$0$i;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
    continue L1;
    break;
   }
   default: {
    $a$2 = $s$0;$fl$6 = $fl$1$;$p$5 = $p$0;$pl$2 = 0;$prefix$2 = 51751;$z$2 = $1;
   }
   }
  } while(0);
  L311: do {
   if ((label|0) == 64) {
    label = 0;
    $207 = $arg;
    $208 = $207;
    $209 = HEAP32[$208>>2]|0;
    $210 = (($207) + 4)|0;
    $211 = $210;
    $212 = HEAP32[$211>>2]|0;
    $213 = $t$1 & 32;
    $214 = ($209|0)==(0);
    $215 = ($212|0)==(0);
    $216 = $214 & $215;
    if ($216) {
     $a$0 = $1;$fl$4 = $fl$3;$p$2 = $p$1;$pl$1 = 0;$prefix$1 = 51751;
     label = 77;
    } else {
     $$012$i = $1;$218 = $209;$225 = $212;
     while(1) {
      $217 = $218 & 15;
      $219 = (51735 + ($217)|0);
      $220 = HEAP8[$219>>0]|0;
      $221 = $220&255;
      $222 = $221 | $213;
      $223 = $222&255;
      $224 = ((($$012$i)) + -1|0);
      HEAP8[$224>>0] = $223;
      $226 = (_bitshift64Lshr(($218|0),($225|0),4)|0);
      $227 = tempRet0;
      $228 = ($226|0)==(0);
      $229 = ($227|0)==(0);
      $230 = $228 & $229;
      if ($230) {
       $$lcssa321 = $224;
       break;
      } else {
       $$012$i = $224;$218 = $226;$225 = $227;
      }
     }
     $231 = $arg;
     $232 = $231;
     $233 = HEAP32[$232>>2]|0;
     $234 = (($231) + 4)|0;
     $235 = $234;
     $236 = HEAP32[$235>>2]|0;
     $237 = ($233|0)==(0);
     $238 = ($236|0)==(0);
     $239 = $237 & $238;
     $240 = $fl$3 & 8;
     $241 = ($240|0)==(0);
     $or$cond17 = $241 | $239;
     if ($or$cond17) {
      $a$0 = $$lcssa321;$fl$4 = $fl$3;$p$2 = $p$1;$pl$1 = 0;$prefix$1 = 51751;
      label = 77;
     } else {
      $242 = $t$1 >> 4;
      $243 = (51751 + ($242)|0);
      $a$0 = $$lcssa321;$fl$4 = $fl$3;$p$2 = $p$1;$pl$1 = 2;$prefix$1 = $243;
      label = 77;
     }
    }
   }
   else if ((label|0) == 76) {
    label = 0;
    $289 = (_fmt_u($287,$288,$1)|0);
    $a$0 = $289;$fl$4 = $fl$1$;$p$2 = $p$0;$pl$1 = $pl$0;$prefix$1 = $prefix$0;
    label = 77;
   }
   else if ((label|0) == 82) {
    label = 0;
    $321 = (_memchr($a$1,0,$p$0)|0);
    $322 = ($321|0)==(0|0);
    $323 = $321;
    $324 = $a$1;
    $325 = (($323) - ($324))|0;
    $326 = (($a$1) + ($p$0)|0);
    $z$1 = $322 ? $326 : $321;
    $p$3 = $322 ? $p$0 : $325;
    $a$2 = $a$1;$fl$6 = $176;$p$5 = $p$3;$pl$2 = 0;$prefix$2 = 51751;$z$2 = $z$1;
   }
   else if ((label|0) == 86) {
    label = 0;
    $i$0105 = 0;$l$1104 = 0;$ws$0106 = $798;
    while(1) {
     $334 = HEAP32[$ws$0106>>2]|0;
     $335 = ($334|0)==(0);
     if ($335) {
      $i$0$lcssa = $i$0105;$l$2 = $l$1104;
      break;
     }
     $336 = (_wctomb($mb,$334)|0);
     $337 = ($336|0)<(0);
     $338 = (($p$4176) - ($i$0105))|0;
     $339 = ($336>>>0)>($338>>>0);
     $or$cond20 = $337 | $339;
     if ($or$cond20) {
      $i$0$lcssa = $i$0105;$l$2 = $336;
      break;
     }
     $340 = ((($ws$0106)) + 4|0);
     $341 = (($336) + ($i$0105))|0;
     $342 = ($p$4176>>>0)>($341>>>0);
     if ($342) {
      $i$0105 = $341;$l$1104 = $336;$ws$0106 = $340;
     } else {
      $i$0$lcssa = $341;$l$2 = $336;
      break;
     }
    }
    $343 = ($l$2|0)<(0);
    if ($343) {
     $$0 = -1;
     break L1;
    }
    _pad($f,32,$w$1,$i$0$lcssa,$fl$1$);
    $344 = ($i$0$lcssa|0)==(0);
    if ($344) {
     $i$0$lcssa178 = 0;
     label = 97;
    } else {
     $i$1116 = 0;$ws$1117 = $798;
     while(1) {
      $345 = HEAP32[$ws$1117>>2]|0;
      $346 = ($345|0)==(0);
      if ($346) {
       $i$0$lcssa178 = $i$0$lcssa;
       label = 97;
       break L311;
      }
      $347 = ((($ws$1117)) + 4|0);
      $348 = (_wctomb($mb,$345)|0);
      $349 = (($348) + ($i$1116))|0;
      $350 = ($349|0)>($i$0$lcssa|0);
      if ($350) {
       $i$0$lcssa178 = $i$0$lcssa;
       label = 97;
       break L311;
      }
      $351 = HEAP32[$f>>2]|0;
      $352 = $351 & 32;
      $353 = ($352|0)==(0);
      if ($353) {
       (___fwritex($mb,$348,$f)|0);
      }
      $354 = ($349>>>0)<($i$0$lcssa>>>0);
      if ($354) {
       $i$1116 = $349;$ws$1117 = $347;
      } else {
       $i$0$lcssa178 = $i$0$lcssa;
       label = 97;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 97) {
   label = 0;
   $355 = $fl$1$ ^ 8192;
   _pad($f,32,$w$1,$i$0$lcssa178,$355);
   $356 = ($w$1|0)>($i$0$lcssa178|0);
   $357 = $356 ? $w$1 : $i$0$lcssa178;
   $cnt$0 = $cnt$1;$l$0 = $357;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
   continue;
  }
  if ((label|0) == 77) {
   label = 0;
   $290 = ($p$2|0)>(-1);
   $291 = $fl$4 & -65537;
   $$fl$4 = $290 ? $291 : $fl$4;
   $292 = $arg;
   $293 = $292;
   $294 = HEAP32[$293>>2]|0;
   $295 = (($292) + 4)|0;
   $296 = $295;
   $297 = HEAP32[$296>>2]|0;
   $298 = ($294|0)!=(0);
   $299 = ($297|0)!=(0);
   $300 = $298 | $299;
   $301 = ($p$2|0)!=(0);
   $or$cond = $301 | $300;
   if ($or$cond) {
    $302 = $a$0;
    $303 = (($2) - ($302))|0;
    $304 = $300&1;
    $305 = $304 ^ 1;
    $306 = (($305) + ($303))|0;
    $307 = ($p$2|0)>($306|0);
    $p$2$ = $307 ? $p$2 : $306;
    $a$2 = $a$0;$fl$6 = $$fl$4;$p$5 = $p$2$;$pl$2 = $pl$1;$prefix$2 = $prefix$1;$z$2 = $1;
   } else {
    $a$2 = $1;$fl$6 = $$fl$4;$p$5 = 0;$pl$2 = $pl$1;$prefix$2 = $prefix$1;$z$2 = $1;
   }
  }
  $770 = $z$2;
  $771 = $a$2;
  $772 = (($770) - ($771))|0;
  $773 = ($p$5|0)<($772|0);
  $$p$5 = $773 ? $772 : $p$5;
  $774 = (($pl$2) + ($$p$5))|0;
  $775 = ($w$1|0)<($774|0);
  $w$2 = $775 ? $774 : $w$1;
  _pad($f,32,$w$2,$774,$fl$6);
  $776 = HEAP32[$f>>2]|0;
  $777 = $776 & 32;
  $778 = ($777|0)==(0);
  if ($778) {
   (___fwritex($prefix$2,$pl$2,$f)|0);
  }
  $779 = $fl$6 ^ 65536;
  _pad($f,48,$w$2,$774,$779);
  _pad($f,48,$$p$5,$772,0);
  $780 = HEAP32[$f>>2]|0;
  $781 = $780 & 32;
  $782 = ($781|0)==(0);
  if ($782) {
   (___fwritex($a$2,$772,$f)|0);
  }
  $783 = $fl$6 ^ 8192;
  _pad($f,32,$w$2,$774,$783);
  $cnt$0 = $cnt$1;$l$0 = $w$2;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
 }
 L345: do {
  if ((label|0) == 244) {
   $784 = ($f|0)==(0|0);
   if ($784) {
    $785 = ($l10n$0$lcssa|0)==(0);
    if ($785) {
     $$0 = 0;
    } else {
     $i$291 = 1;
     while(1) {
      $786 = (($nl_type) + ($i$291<<2)|0);
      $787 = HEAP32[$786>>2]|0;
      $788 = ($787|0)==(0);
      if ($788) {
       $i$291$lcssa = $i$291;
       break;
      }
      $790 = (($nl_arg) + ($i$291<<3)|0);
      _pop_arg($790,$787,$ap);
      $791 = (($i$291) + 1)|0;
      $792 = ($791|0)<(10);
      if ($792) {
       $i$291 = $791;
      } else {
       $$0 = 1;
       break L345;
      }
     }
     $789 = ($i$291$lcssa|0)<(10);
     if ($789) {
      $i$389 = $i$291$lcssa;
      while(1) {
       $795 = (($nl_type) + ($i$389<<2)|0);
       $796 = HEAP32[$795>>2]|0;
       $797 = ($796|0)==(0);
       $794 = (($i$389) + 1)|0;
       if (!($797)) {
        $$0 = -1;
        break L345;
       }
       $793 = ($794|0)<(10);
       if ($793) {
        $i$389 = $794;
       } else {
        $$0 = 1;
        break;
       }
      }
     } else {
      $$0 = 1;
     }
    }
   } else {
    $$0 = $cnt$1$lcssa;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___fwritex($s,$l,$f) {
 $s = $s|0;
 $l = $l|0;
 $f = $f|0;
 var $$0 = 0, $$01 = 0, $$02 = 0, $$pre = 0, $$pre6 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$0 = 0, $i$0$lcssa12 = 0;
 var $i$1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 16|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $4 = (___towrite($f)|0);
  $5 = ($4|0)==(0);
  if ($5) {
   $$pre = HEAP32[$0>>2]|0;
   $9 = $$pre;
   label = 5;
  } else {
   $$0 = 0;
  }
 } else {
  $3 = $1;
  $9 = $3;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $6 = ((($f)) + 20|0);
   $7 = HEAP32[$6>>2]|0;
   $8 = (($9) - ($7))|0;
   $10 = ($8>>>0)<($l>>>0);
   $11 = $7;
   if ($10) {
    $12 = ((($f)) + 36|0);
    $13 = HEAP32[$12>>2]|0;
    $14 = (FUNCTION_TABLE_iiii[$13 & 7]($f,$s,$l)|0);
    $$0 = $14;
    break;
   }
   $15 = ((($f)) + 75|0);
   $16 = HEAP8[$15>>0]|0;
   $17 = ($16<<24>>24)>(-1);
   L10: do {
    if ($17) {
     $i$0 = $l;
     while(1) {
      $18 = ($i$0|0)==(0);
      if ($18) {
       $$01 = $l;$$02 = $s;$29 = $11;$i$1 = 0;
       break L10;
      }
      $19 = (($i$0) + -1)|0;
      $20 = (($s) + ($19)|0);
      $21 = HEAP8[$20>>0]|0;
      $22 = ($21<<24>>24)==(10);
      if ($22) {
       $i$0$lcssa12 = $i$0;
       break;
      } else {
       $i$0 = $19;
      }
     }
     $23 = ((($f)) + 36|0);
     $24 = HEAP32[$23>>2]|0;
     $25 = (FUNCTION_TABLE_iiii[$24 & 7]($f,$s,$i$0$lcssa12)|0);
     $26 = ($25>>>0)<($i$0$lcssa12>>>0);
     if ($26) {
      $$0 = $i$0$lcssa12;
      break L5;
     }
     $27 = (($s) + ($i$0$lcssa12)|0);
     $28 = (($l) - ($i$0$lcssa12))|0;
     $$pre6 = HEAP32[$6>>2]|0;
     $$01 = $28;$$02 = $27;$29 = $$pre6;$i$1 = $i$0$lcssa12;
    } else {
     $$01 = $l;$$02 = $s;$29 = $11;$i$1 = 0;
    }
   } while(0);
   _memcpy(($29|0),($$02|0),($$01|0))|0;
   $30 = HEAP32[$6>>2]|0;
   $31 = (($30) + ($$01)|0);
   HEAP32[$6>>2] = $31;
   $32 = (($i$1) + ($$01))|0;
   $$0 = $32;
  }
 } while(0);
 return ($$0|0);
}
function ___towrite($f) {
 $f = $f|0;
 var $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 74|0);
 $1 = HEAP8[$0>>0]|0;
 $2 = $1 << 24 >> 24;
 $3 = (($2) + 255)|0;
 $4 = $3 | $2;
 $5 = $4&255;
 HEAP8[$0>>0] = $5;
 $6 = HEAP32[$f>>2]|0;
 $7 = $6 & 8;
 $8 = ($7|0)==(0);
 if ($8) {
  $10 = ((($f)) + 8|0);
  HEAP32[$10>>2] = 0;
  $11 = ((($f)) + 4|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($f)) + 44|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ((($f)) + 28|0);
  HEAP32[$14>>2] = $13;
  $15 = ((($f)) + 20|0);
  HEAP32[$15>>2] = $13;
  $16 = $13;
  $17 = ((($f)) + 48|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = (($16) + ($18)|0);
  $20 = ((($f)) + 16|0);
  HEAP32[$20>>2] = $19;
  $$0 = 0;
 } else {
  $9 = $6 | 32;
  HEAP32[$f>>2] = $9;
  $$0 = -1;
 }
 return ($$0|0);
}
function _pop_arg($arg,$type,$ap) {
 $arg = $arg|0;
 $type = $type|0;
 $ap = $ap|0;
 var $$mask = 0, $$mask1 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0.0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0.0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($type>>>0)>(20);
 L1: do {
  if (!($0)) {
   do {
    switch ($type|0) {
    case 9:  {
     $arglist_current = HEAP32[$ap>>2]|0;
     $1 = $arglist_current;
     $2 = ((0) + 4|0);
     $expanded28 = $2;
     $expanded = (($expanded28) - 1)|0;
     $3 = (($1) + ($expanded))|0;
     $4 = ((0) + 4|0);
     $expanded32 = $4;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $5 = $3 & $expanded30;
     $6 = $5;
     $7 = HEAP32[$6>>2]|0;
     $arglist_next = ((($6)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next;
     HEAP32[$arg>>2] = $7;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$ap>>2]|0;
     $8 = $arglist_current2;
     $9 = ((0) + 4|0);
     $expanded35 = $9;
     $expanded34 = (($expanded35) - 1)|0;
     $10 = (($8) + ($expanded34))|0;
     $11 = ((0) + 4|0);
     $expanded39 = $11;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $12 = $10 & $expanded37;
     $13 = $12;
     $14 = HEAP32[$13>>2]|0;
     $arglist_next3 = ((($13)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next3;
     $15 = ($14|0)<(0);
     $16 = $15 << 31 >> 31;
     $17 = $arg;
     $18 = $17;
     HEAP32[$18>>2] = $14;
     $19 = (($17) + 4)|0;
     $20 = $19;
     HEAP32[$20>>2] = $16;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$ap>>2]|0;
     $21 = $arglist_current5;
     $22 = ((0) + 4|0);
     $expanded42 = $22;
     $expanded41 = (($expanded42) - 1)|0;
     $23 = (($21) + ($expanded41))|0;
     $24 = ((0) + 4|0);
     $expanded46 = $24;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $25 = $23 & $expanded44;
     $26 = $25;
     $27 = HEAP32[$26>>2]|0;
     $arglist_next6 = ((($26)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next6;
     $28 = $arg;
     $29 = $28;
     HEAP32[$29>>2] = $27;
     $30 = (($28) + 4)|0;
     $31 = $30;
     HEAP32[$31>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$ap>>2]|0;
     $32 = $arglist_current8;
     $33 = ((0) + 8|0);
     $expanded49 = $33;
     $expanded48 = (($expanded49) - 1)|0;
     $34 = (($32) + ($expanded48))|0;
     $35 = ((0) + 8|0);
     $expanded53 = $35;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $36 = $34 & $expanded51;
     $37 = $36;
     $38 = $37;
     $39 = $38;
     $40 = HEAP32[$39>>2]|0;
     $41 = (($38) + 4)|0;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $arglist_next9 = ((($37)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next9;
     $44 = $arg;
     $45 = $44;
     HEAP32[$45>>2] = $40;
     $46 = (($44) + 4)|0;
     $47 = $46;
     HEAP32[$47>>2] = $43;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$ap>>2]|0;
     $48 = $arglist_current11;
     $49 = ((0) + 4|0);
     $expanded56 = $49;
     $expanded55 = (($expanded56) - 1)|0;
     $50 = (($48) + ($expanded55))|0;
     $51 = ((0) + 4|0);
     $expanded60 = $51;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $52 = $50 & $expanded58;
     $53 = $52;
     $54 = HEAP32[$53>>2]|0;
     $arglist_next12 = ((($53)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next12;
     $55 = $54&65535;
     $56 = $55 << 16 >> 16;
     $57 = ($56|0)<(0);
     $58 = $57 << 31 >> 31;
     $59 = $arg;
     $60 = $59;
     HEAP32[$60>>2] = $56;
     $61 = (($59) + 4)|0;
     $62 = $61;
     HEAP32[$62>>2] = $58;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$ap>>2]|0;
     $63 = $arglist_current14;
     $64 = ((0) + 4|0);
     $expanded63 = $64;
     $expanded62 = (($expanded63) - 1)|0;
     $65 = (($63) + ($expanded62))|0;
     $66 = ((0) + 4|0);
     $expanded67 = $66;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $67 = $65 & $expanded65;
     $68 = $67;
     $69 = HEAP32[$68>>2]|0;
     $arglist_next15 = ((($68)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next15;
     $$mask1 = $69 & 65535;
     $70 = $arg;
     $71 = $70;
     HEAP32[$71>>2] = $$mask1;
     $72 = (($70) + 4)|0;
     $73 = $72;
     HEAP32[$73>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$ap>>2]|0;
     $74 = $arglist_current17;
     $75 = ((0) + 4|0);
     $expanded70 = $75;
     $expanded69 = (($expanded70) - 1)|0;
     $76 = (($74) + ($expanded69))|0;
     $77 = ((0) + 4|0);
     $expanded74 = $77;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $78 = $76 & $expanded72;
     $79 = $78;
     $80 = HEAP32[$79>>2]|0;
     $arglist_next18 = ((($79)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next18;
     $81 = $80&255;
     $82 = $81 << 24 >> 24;
     $83 = ($82|0)<(0);
     $84 = $83 << 31 >> 31;
     $85 = $arg;
     $86 = $85;
     HEAP32[$86>>2] = $82;
     $87 = (($85) + 4)|0;
     $88 = $87;
     HEAP32[$88>>2] = $84;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$ap>>2]|0;
     $89 = $arglist_current20;
     $90 = ((0) + 4|0);
     $expanded77 = $90;
     $expanded76 = (($expanded77) - 1)|0;
     $91 = (($89) + ($expanded76))|0;
     $92 = ((0) + 4|0);
     $expanded81 = $92;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $93 = $91 & $expanded79;
     $94 = $93;
     $95 = HEAP32[$94>>2]|0;
     $arglist_next21 = ((($94)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next21;
     $$mask = $95 & 255;
     $96 = $arg;
     $97 = $96;
     HEAP32[$97>>2] = $$mask;
     $98 = (($96) + 4)|0;
     $99 = $98;
     HEAP32[$99>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$ap>>2]|0;
     $100 = $arglist_current23;
     $101 = ((0) + 8|0);
     $expanded84 = $101;
     $expanded83 = (($expanded84) - 1)|0;
     $102 = (($100) + ($expanded83))|0;
     $103 = ((0) + 8|0);
     $expanded88 = $103;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $104 = $102 & $expanded86;
     $105 = $104;
     $106 = +HEAPF64[$105>>3];
     $arglist_next24 = ((($105)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next24;
     HEAPF64[$arg>>3] = $106;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$ap>>2]|0;
     $107 = $arglist_current26;
     $108 = ((0) + 8|0);
     $expanded91 = $108;
     $expanded90 = (($expanded91) - 1)|0;
     $109 = (($107) + ($expanded90))|0;
     $110 = ((0) + 8|0);
     $expanded95 = $110;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $111 = $109 & $expanded93;
     $112 = $111;
     $113 = +HEAPF64[$112>>3];
     $arglist_next27 = ((($112)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next27;
     HEAPF64[$arg>>3] = $113;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_u($0,$1,$s) {
 $0 = $0|0;
 $1 = $1|0;
 $s = $s|0;
 var $$0$lcssa = 0, $$01$lcssa$off0 = 0, $$05 = 0, $$1$lcssa = 0, $$12 = 0, $$lcssa19 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $y$03 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1>>>0)>(0);
 $3 = ($0>>>0)>(4294967295);
 $4 = ($1|0)==(0);
 $5 = $4 & $3;
 $6 = $2 | $5;
 if ($6) {
  $$05 = $s;$7 = $0;$8 = $1;
  while(1) {
   $9 = (___uremdi3(($7|0),($8|0),10,0)|0);
   $10 = tempRet0;
   $11 = $9 | 48;
   $12 = $11&255;
   $13 = ((($$05)) + -1|0);
   HEAP8[$13>>0] = $12;
   $14 = (___udivdi3(($7|0),($8|0),10,0)|0);
   $15 = tempRet0;
   $16 = ($8>>>0)>(9);
   $17 = ($7>>>0)>(4294967295);
   $18 = ($8|0)==(9);
   $19 = $18 & $17;
   $20 = $16 | $19;
   if ($20) {
    $$05 = $13;$7 = $14;$8 = $15;
   } else {
    $$lcssa19 = $13;$28 = $14;$29 = $15;
    break;
   }
  }
  $$0$lcssa = $$lcssa19;$$01$lcssa$off0 = $28;
 } else {
  $$0$lcssa = $s;$$01$lcssa$off0 = $0;
 }
 $21 = ($$01$lcssa$off0|0)==(0);
 if ($21) {
  $$1$lcssa = $$0$lcssa;
 } else {
  $$12 = $$0$lcssa;$y$03 = $$01$lcssa$off0;
  while(1) {
   $22 = (($y$03>>>0) % 10)&-1;
   $23 = $22 | 48;
   $24 = $23&255;
   $25 = ((($$12)) + -1|0);
   HEAP8[$25>>0] = $24;
   $26 = (($y$03>>>0) / 10)&-1;
   $27 = ($y$03>>>0)<(10);
   if ($27) {
    $$1$lcssa = $25;
    break;
   } else {
    $$12 = $25;$y$03 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($e) {
 $e = $e|0;
 var $$lcssa = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$03 = 0, $i$03$lcssa = 0, $i$12 = 0, $s$0$lcssa = 0, $s$01 = 0, $s$1 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $i$03 = 0;
 while(1) {
  $1 = (51761 + ($i$03)|0);
  $2 = HEAP8[$1>>0]|0;
  $3 = $2&255;
  $4 = ($3|0)==($e|0);
  if ($4) {
   $i$03$lcssa = $i$03;
   label = 2;
   break;
  }
  $5 = (($i$03) + 1)|0;
  $6 = ($5|0)==(87);
  if ($6) {
   $i$12 = 87;$s$01 = 51849;
   label = 5;
   break;
  } else {
   $i$03 = $5;
  }
 }
 if ((label|0) == 2) {
  $0 = ($i$03$lcssa|0)==(0);
  if ($0) {
   $s$0$lcssa = 51849;
  } else {
   $i$12 = $i$03$lcssa;$s$01 = 51849;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $s$1 = $s$01;
   while(1) {
    $7 = HEAP8[$s$1>>0]|0;
    $8 = ($7<<24>>24)==(0);
    $9 = ((($s$1)) + 1|0);
    if ($8) {
     $$lcssa = $9;
     break;
    } else {
     $s$1 = $9;
    }
   }
   $10 = (($i$12) + -1)|0;
   $11 = ($10|0)==(0);
   if ($11) {
    $s$0$lcssa = $$lcssa;
    break;
   } else {
    $i$12 = $10;$s$01 = $$lcssa;
    label = 5;
   }
  }
 }
 return ($s$0$lcssa|0);
}
function _memchr($src,$c,$n) {
 $src = $src|0;
 $c = $c|0;
 $n = $n|0;
 var $$0$lcssa = 0, $$0$lcssa30 = 0, $$019 = 0, $$1$lcssa = 0, $$110 = 0, $$110$lcssa = 0, $$24 = 0, $$3 = 0, $$lcssa = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0;
 var $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond18 = 0, $s$0$lcssa = 0, $s$0$lcssa29 = 0, $s$020 = 0, $s$15 = 0, $s$2 = 0, $w$0$lcssa = 0, $w$011 = 0, $w$011$lcssa = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $c & 255;
 $1 = $src;
 $2 = $1 & 3;
 $3 = ($2|0)!=(0);
 $4 = ($n|0)!=(0);
 $or$cond18 = $4 & $3;
 L1: do {
  if ($or$cond18) {
   $5 = $c&255;
   $$019 = $n;$s$020 = $src;
   while(1) {
    $6 = HEAP8[$s$020>>0]|0;
    $7 = ($6<<24>>24)==($5<<24>>24);
    if ($7) {
     $$0$lcssa30 = $$019;$s$0$lcssa29 = $s$020;
     label = 6;
     break L1;
    }
    $8 = ((($s$020)) + 1|0);
    $9 = (($$019) + -1)|0;
    $10 = $8;
    $11 = $10 & 3;
    $12 = ($11|0)!=(0);
    $13 = ($9|0)!=(0);
    $or$cond = $13 & $12;
    if ($or$cond) {
     $$019 = $9;$s$020 = $8;
    } else {
     $$0$lcssa = $9;$$lcssa = $13;$s$0$lcssa = $8;
     label = 5;
     break;
    }
   }
  } else {
   $$0$lcssa = $n;$$lcssa = $4;$s$0$lcssa = $src;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$0$lcssa30 = $$0$lcssa;$s$0$lcssa29 = $s$0$lcssa;
   label = 6;
  } else {
   $$3 = 0;$s$2 = $s$0$lcssa;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $14 = HEAP8[$s$0$lcssa29>>0]|0;
   $15 = $c&255;
   $16 = ($14<<24>>24)==($15<<24>>24);
   if ($16) {
    $$3 = $$0$lcssa30;$s$2 = $s$0$lcssa29;
   } else {
    $17 = Math_imul($0, 16843009)|0;
    $18 = ($$0$lcssa30>>>0)>(3);
    L11: do {
     if ($18) {
      $$110 = $$0$lcssa30;$w$011 = $s$0$lcssa29;
      while(1) {
       $19 = HEAP32[$w$011>>2]|0;
       $20 = $19 ^ $17;
       $21 = (($20) + -16843009)|0;
       $22 = $20 & -2139062144;
       $23 = $22 ^ -2139062144;
       $24 = $23 & $21;
       $25 = ($24|0)==(0);
       if (!($25)) {
        $$110$lcssa = $$110;$w$011$lcssa = $w$011;
        break;
       }
       $26 = ((($w$011)) + 4|0);
       $27 = (($$110) + -4)|0;
       $28 = ($27>>>0)>(3);
       if ($28) {
        $$110 = $27;$w$011 = $26;
       } else {
        $$1$lcssa = $27;$w$0$lcssa = $26;
        label = 11;
        break L11;
       }
      }
      $$24 = $$110$lcssa;$s$15 = $w$011$lcssa;
     } else {
      $$1$lcssa = $$0$lcssa30;$w$0$lcssa = $s$0$lcssa29;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $29 = ($$1$lcssa|0)==(0);
     if ($29) {
      $$3 = 0;$s$2 = $w$0$lcssa;
      break;
     } else {
      $$24 = $$1$lcssa;$s$15 = $w$0$lcssa;
     }
    }
    while(1) {
     $30 = HEAP8[$s$15>>0]|0;
     $31 = ($30<<24>>24)==($15<<24>>24);
     if ($31) {
      $$3 = $$24;$s$2 = $s$15;
      break L8;
     }
     $32 = ((($s$15)) + 1|0);
     $33 = (($$24) + -1)|0;
     $34 = ($33|0)==(0);
     if ($34) {
      $$3 = 0;$s$2 = $32;
      break;
     } else {
      $$24 = $33;$s$15 = $32;
     }
    }
   }
  }
 } while(0);
 $35 = ($$3|0)!=(0);
 $36 = $35 ? $s$2 : 0;
 return ($36|0);
}
function _pad($f,$c,$w,$l,$fl) {
 $f = $f|0;
 $c = $c|0;
 $w = $w|0;
 $l = $l|0;
 $fl = $fl|0;
 var $$0$lcssa6 = 0, $$02 = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $or$cond = 0, $pad = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $pad = sp;
 $0 = $fl & 73728;
 $1 = ($0|0)==(0);
 $2 = ($w|0)>($l|0);
 $or$cond = $2 & $1;
 do {
  if ($or$cond) {
   $3 = (($w) - ($l))|0;
   $4 = ($3>>>0)>(256);
   $5 = $4 ? 256 : $3;
   _memset(($pad|0),($c|0),($5|0))|0;
   $6 = ($3>>>0)>(255);
   $7 = HEAP32[$f>>2]|0;
   $8 = $7 & 32;
   $9 = ($8|0)==(0);
   if ($6) {
    $10 = (($w) - ($l))|0;
    $$02 = $3;$17 = $7;$18 = $9;
    while(1) {
     if ($18) {
      (___fwritex($pad,256,$f)|0);
      $$pre = HEAP32[$f>>2]|0;
      $14 = $$pre;
     } else {
      $14 = $17;
     }
     $11 = (($$02) + -256)|0;
     $12 = ($11>>>0)>(255);
     $13 = $14 & 32;
     $15 = ($13|0)==(0);
     if ($12) {
      $$02 = $11;$17 = $14;$18 = $15;
     } else {
      break;
     }
    }
    $16 = $10 & 255;
    if ($15) {
     $$0$lcssa6 = $16;
    } else {
     break;
    }
   } else {
    if ($9) {
     $$0$lcssa6 = $3;
    } else {
     break;
    }
   }
   (___fwritex($pad,$$0$lcssa6,$f)|0);
  }
 } while(0);
 STACKTOP = sp;return;
}
function _wctomb($s,$wc) {
 $s = $s|0;
 $wc = $wc|0;
 var $$0 = 0, $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($s|0)==(0|0);
 if ($0) {
  $$0 = 0;
 } else {
  $1 = (_wcrtomb($s,$wc,0)|0);
  $$0 = $1;
 }
 return ($$0|0);
}
function _wcrtomb($s,$wc,$st) {
 $s = $s|0;
 $wc = $wc|0;
 $st = $st|0;
 var $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($s|0)==(0|0);
 do {
  if ($0) {
   $$0 = 1;
  } else {
   $1 = ($wc>>>0)<(128);
   if ($1) {
    $2 = $wc&255;
    HEAP8[$s>>0] = $2;
    $$0 = 1;
    break;
   }
   $3 = ($wc>>>0)<(2048);
   if ($3) {
    $4 = $wc >>> 6;
    $5 = $4 | 192;
    $6 = $5&255;
    $7 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $6;
    $8 = $wc & 63;
    $9 = $8 | 128;
    $10 = $9&255;
    HEAP8[$7>>0] = $10;
    $$0 = 2;
    break;
   }
   $11 = ($wc>>>0)<(55296);
   $12 = $wc & -8192;
   $13 = ($12|0)==(57344);
   $or$cond = $11 | $13;
   if ($or$cond) {
    $14 = $wc >>> 12;
    $15 = $14 | 224;
    $16 = $15&255;
    $17 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $16;
    $18 = $wc >>> 6;
    $19 = $18 & 63;
    $20 = $19 | 128;
    $21 = $20&255;
    $22 = ((($s)) + 2|0);
    HEAP8[$17>>0] = $21;
    $23 = $wc & 63;
    $24 = $23 | 128;
    $25 = $24&255;
    HEAP8[$22>>0] = $25;
    $$0 = 3;
    break;
   }
   $26 = (($wc) + -65536)|0;
   $27 = ($26>>>0)<(1048576);
   if ($27) {
    $28 = $wc >>> 18;
    $29 = $28 | 240;
    $30 = $29&255;
    $31 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $30;
    $32 = $wc >>> 12;
    $33 = $32 & 63;
    $34 = $33 | 128;
    $35 = $34&255;
    $36 = ((($s)) + 2|0);
    HEAP8[$31>>0] = $35;
    $37 = $wc >>> 6;
    $38 = $37 & 63;
    $39 = $38 | 128;
    $40 = $39&255;
    $41 = ((($s)) + 3|0);
    HEAP8[$36>>0] = $40;
    $42 = $wc & 63;
    $43 = $42 | 128;
    $44 = $43&255;
    HEAP8[$41>>0] = $44;
    $$0 = 4;
    break;
   } else {
    $45 = (___errno_location()|0);
    HEAP32[$45>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___lockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function _fflush($f) {
 $f = $f|0;
 var $$0 = 0, $$01 = 0, $$012 = 0, $$014 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, $r$0$lcssa = 0, $r$03 = 0, $r$1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($f|0)==(0|0);
 do {
  if ($0) {
   $7 = HEAP32[12622]|0;
   $8 = ($7|0)==(0|0);
   if ($8) {
    $27 = 0;
   } else {
    $9 = HEAP32[12622]|0;
    $10 = (_fflush($9)|0);
    $27 = $10;
   }
   ___lock(((53732)|0));
   $$012 = HEAP32[(53728)>>2]|0;
   $11 = ($$012|0)==(0|0);
   if ($11) {
    $r$0$lcssa = $27;
   } else {
    $$014 = $$012;$r$03 = $27;
    while(1) {
     $12 = ((($$014)) + 76|0);
     $13 = HEAP32[$12>>2]|0;
     $14 = ($13|0)>(-1);
     if ($14) {
      $15 = (___lockfile($$014)|0);
      $24 = $15;
     } else {
      $24 = 0;
     }
     $16 = ((($$014)) + 20|0);
     $17 = HEAP32[$16>>2]|0;
     $18 = ((($$014)) + 28|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ($17>>>0)>($19>>>0);
     if ($20) {
      $21 = (___fflush_unlocked($$014)|0);
      $22 = $21 | $r$03;
      $r$1 = $22;
     } else {
      $r$1 = $r$03;
     }
     $23 = ($24|0)==(0);
     if (!($23)) {
      ___unlockfile($$014);
     }
     $25 = ((($$014)) + 56|0);
     $$01 = HEAP32[$25>>2]|0;
     $26 = ($$01|0)==(0|0);
     if ($26) {
      $r$0$lcssa = $r$1;
      break;
     } else {
      $$014 = $$01;$r$03 = $r$1;
     }
    }
   }
   ___unlock(((53732)|0));
   $$0 = $r$0$lcssa;
  } else {
   $1 = ((($f)) + 76|0);
   $2 = HEAP32[$1>>2]|0;
   $3 = ($2|0)>(-1);
   if (!($3)) {
    $4 = (___fflush_unlocked($f)|0);
    $$0 = $4;
    break;
   }
   $5 = (___lockfile($f)|0);
   $phitmp = ($5|0)==(0);
   $6 = (___fflush_unlocked($f)|0);
   if ($phitmp) {
    $$0 = $6;
   } else {
    ___unlockfile($f);
    $$0 = $6;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($f) {
 $f = $f|0;
 var $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 20|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($f)) + 28|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($1>>>0)>($3>>>0);
 if ($4) {
  $5 = ((($f)) + 36|0);
  $6 = HEAP32[$5>>2]|0;
  (FUNCTION_TABLE_iiii[$6 & 7]($f,0,0)|0);
  $7 = HEAP32[$0>>2]|0;
  $8 = ($7|0)==(0|0);
  if ($8) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $9 = ((($f)) + 4|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ((($f)) + 8|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = ($10>>>0)<($12>>>0);
  if ($13) {
   $14 = ((($f)) + 40|0);
   $15 = HEAP32[$14>>2]|0;
   $16 = $10;
   $17 = $12;
   $18 = (($16) - ($17))|0;
   (FUNCTION_TABLE_iiii[$15 & 7]($f,$18,1)|0);
  }
  $19 = ((($f)) + 16|0);
  HEAP32[$19>>2] = 0;
  HEAP32[$2>>2] = 0;
  HEAP32[$0>>2] = 0;
  HEAP32[$11>>2] = 0;
  HEAP32[$9>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function _fprintf($f,$fmt,$varargs) {
 $f = $f|0;
 $fmt = $fmt|0;
 $varargs = $varargs|0;
 var $0 = 0, $ap = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $ap = sp;
 HEAP32[$ap>>2] = $varargs;
 $0 = (_vfprintf($f,$fmt,$ap)|0);
 STACKTOP = sp;return ($0|0);
}
function _malloc($bytes) {
 $bytes = $bytes|0;
 var $$0 = 0, $$lcssa = 0, $$lcssa141 = 0, $$lcssa142 = 0, $$lcssa144 = 0, $$lcssa147 = 0, $$lcssa149 = 0, $$lcssa151 = 0, $$lcssa153 = 0, $$lcssa155 = 0, $$lcssa157 = 0, $$not$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i13 = 0, $$pre$i16$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i14Z2D = 0, $$pre$phi$i17$iZ2D = 0;
 var $$pre$phi$iZ2D = 0, $$pre$phi10$i$iZ2D = 0, $$pre$phiZ2D = 0, $$pre71 = 0, $$pre9$i$i = 0, $$rsize$0$i = 0, $$rsize$4$i = 0, $$v$0$i = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0;
 var $1008 = 0, $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0;
 var $1026 = 0, $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0;
 var $1044 = 0, $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $1059 = 0, $106 = 0, $1060 = 0, $1061 = 0;
 var $1062 = 0, $1063 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0;
 var $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0;
 var $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0;
 var $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0;
 var $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0;
 var $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0;
 var $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0;
 var $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0;
 var $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0;
 var $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0;
 var $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0;
 var $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0;
 var $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0;
 var $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0;
 var $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0;
 var $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0;
 var $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0;
 var $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0;
 var $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0;
 var $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0;
 var $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0;
 var $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0;
 var $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0;
 var $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0;
 var $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0;
 var $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0;
 var $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0;
 var $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0;
 var $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0;
 var $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0;
 var $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0;
 var $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0;
 var $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0;
 var $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0;
 var $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0;
 var $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0;
 var $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0;
 var $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0;
 var $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0;
 var $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0;
 var $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0;
 var $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0;
 var $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0;
 var $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0;
 var $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0;
 var $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $F$0$i$i = 0, $F1$0$i = 0, $F4$0 = 0, $F4$0$i$i = 0, $F5$0$i = 0, $I1$0$i$i = 0, $I7$0$i = 0, $I7$0$i$i = 0;
 var $K12$0$i = 0, $K2$0$i$i = 0, $K8$0$i$i = 0, $R$1$i = 0, $R$1$i$i = 0, $R$1$i$i$lcssa = 0, $R$1$i$lcssa = 0, $R$1$i9 = 0, $R$1$i9$lcssa = 0, $R$3$i = 0, $R$3$i$i = 0, $R$3$i11 = 0, $RP$1$i = 0, $RP$1$i$i = 0, $RP$1$i$i$lcssa = 0, $RP$1$i$lcssa = 0, $RP$1$i8 = 0, $RP$1$i8$lcssa = 0, $T$0$i = 0, $T$0$i$i = 0;
 var $T$0$i$i$lcssa = 0, $T$0$i$i$lcssa140 = 0, $T$0$i$lcssa = 0, $T$0$i$lcssa156 = 0, $T$0$i18$i = 0, $T$0$i18$i$lcssa = 0, $T$0$i18$i$lcssa139 = 0, $br$2$ph$i = 0, $cond$i = 0, $cond$i$i = 0, $cond$i12 = 0, $exitcond$i$i = 0, $i$01$i$i = 0, $idx$0$i = 0, $nb$0 = 0, $not$$i$i = 0, $not$$i20$i = 0, $not$7$i = 0, $oldfirst$0$i$i = 0, $or$cond$i = 0;
 var $or$cond$i17 = 0, $or$cond1$i = 0, $or$cond1$i16 = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond2$i = 0, $or$cond48$i = 0, $or$cond5$i = 0, $or$cond7$i = 0, $or$cond8$i = 0, $p$0$i$i = 0, $qsize$0$i$i = 0, $rsize$0$i = 0, $rsize$0$i$lcssa = 0, $rsize$0$i5 = 0, $rsize$1$i = 0, $rsize$3$i = 0, $rsize$4$lcssa$i = 0, $rsize$412$i = 0, $rst$0$i = 0;
 var $rst$1$i = 0, $sizebits$0$$i = 0, $sizebits$0$i = 0, $sp$0$i$i = 0, $sp$0$i$i$i = 0, $sp$068$i = 0, $sp$068$i$lcssa = 0, $sp$167$i = 0, $sp$167$i$lcssa = 0, $ssize$0$i = 0, $ssize$2$ph$i = 0, $ssize$5$i = 0, $t$0$i = 0, $t$0$i4 = 0, $t$2$i = 0, $t$4$ph$i = 0, $t$4$v$4$i = 0, $t$411$i = 0, $tbase$746$i = 0, $tsize$745$i = 0;
 var $v$0$i = 0, $v$0$i$lcssa = 0, $v$0$i6 = 0, $v$1$i = 0, $v$3$i = 0, $v$4$lcssa$i = 0, $v$413$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($bytes>>>0)<(245);
 do {
  if ($0) {
   $1 = ($bytes>>>0)<(11);
   $2 = (($bytes) + 11)|0;
   $3 = $2 & -8;
   $4 = $1 ? 16 : $3;
   $5 = $4 >>> 3;
   $6 = HEAP32[13438]|0;
   $7 = $6 >>> $5;
   $8 = $7 & 3;
   $9 = ($8|0)==(0);
   if (!($9)) {
    $10 = $7 & 1;
    $11 = $10 ^ 1;
    $12 = (($11) + ($5))|0;
    $13 = $12 << 1;
    $14 = (53792 + ($13<<2)|0);
    $15 = ((($14)) + 8|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ($14|0)==($18|0);
    do {
     if ($19) {
      $20 = 1 << $12;
      $21 = $20 ^ -1;
      $22 = $6 & $21;
      HEAP32[13438] = $22;
     } else {
      $23 = HEAP32[(53768)>>2]|0;
      $24 = ($18>>>0)<($23>>>0);
      if ($24) {
       _abort();
       // unreachable;
      }
      $25 = ((($18)) + 12|0);
      $26 = HEAP32[$25>>2]|0;
      $27 = ($26|0)==($16|0);
      if ($27) {
       HEAP32[$25>>2] = $14;
       HEAP32[$15>>2] = $18;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $28 = $12 << 3;
    $29 = $28 | 3;
    $30 = ((($16)) + 4|0);
    HEAP32[$30>>2] = $29;
    $31 = (($16) + ($28)|0);
    $32 = ((($31)) + 4|0);
    $33 = HEAP32[$32>>2]|0;
    $34 = $33 | 1;
    HEAP32[$32>>2] = $34;
    $$0 = $17;
    return ($$0|0);
   }
   $35 = HEAP32[(53760)>>2]|0;
   $36 = ($4>>>0)>($35>>>0);
   if ($36) {
    $37 = ($7|0)==(0);
    if (!($37)) {
     $38 = $7 << $5;
     $39 = 2 << $5;
     $40 = (0 - ($39))|0;
     $41 = $39 | $40;
     $42 = $38 & $41;
     $43 = (0 - ($42))|0;
     $44 = $42 & $43;
     $45 = (($44) + -1)|0;
     $46 = $45 >>> 12;
     $47 = $46 & 16;
     $48 = $45 >>> $47;
     $49 = $48 >>> 5;
     $50 = $49 & 8;
     $51 = $50 | $47;
     $52 = $48 >>> $50;
     $53 = $52 >>> 2;
     $54 = $53 & 4;
     $55 = $51 | $54;
     $56 = $52 >>> $54;
     $57 = $56 >>> 1;
     $58 = $57 & 2;
     $59 = $55 | $58;
     $60 = $56 >>> $58;
     $61 = $60 >>> 1;
     $62 = $61 & 1;
     $63 = $59 | $62;
     $64 = $60 >>> $62;
     $65 = (($63) + ($64))|0;
     $66 = $65 << 1;
     $67 = (53792 + ($66<<2)|0);
     $68 = ((($67)) + 8|0);
     $69 = HEAP32[$68>>2]|0;
     $70 = ((($69)) + 8|0);
     $71 = HEAP32[$70>>2]|0;
     $72 = ($67|0)==($71|0);
     do {
      if ($72) {
       $73 = 1 << $65;
       $74 = $73 ^ -1;
       $75 = $6 & $74;
       HEAP32[13438] = $75;
       $90 = $35;
      } else {
       $76 = HEAP32[(53768)>>2]|0;
       $77 = ($71>>>0)<($76>>>0);
       if ($77) {
        _abort();
        // unreachable;
       }
       $78 = ((($71)) + 12|0);
       $79 = HEAP32[$78>>2]|0;
       $80 = ($79|0)==($69|0);
       if ($80) {
        HEAP32[$78>>2] = $67;
        HEAP32[$68>>2] = $71;
        $$pre = HEAP32[(53760)>>2]|0;
        $90 = $$pre;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $81 = $65 << 3;
     $82 = (($81) - ($4))|0;
     $83 = $4 | 3;
     $84 = ((($69)) + 4|0);
     HEAP32[$84>>2] = $83;
     $85 = (($69) + ($4)|0);
     $86 = $82 | 1;
     $87 = ((($85)) + 4|0);
     HEAP32[$87>>2] = $86;
     $88 = (($85) + ($82)|0);
     HEAP32[$88>>2] = $82;
     $89 = ($90|0)==(0);
     if (!($89)) {
      $91 = HEAP32[(53772)>>2]|0;
      $92 = $90 >>> 3;
      $93 = $92 << 1;
      $94 = (53792 + ($93<<2)|0);
      $95 = HEAP32[13438]|0;
      $96 = 1 << $92;
      $97 = $95 & $96;
      $98 = ($97|0)==(0);
      if ($98) {
       $99 = $95 | $96;
       HEAP32[13438] = $99;
       $$pre71 = ((($94)) + 8|0);
       $$pre$phiZ2D = $$pre71;$F4$0 = $94;
      } else {
       $100 = ((($94)) + 8|0);
       $101 = HEAP32[$100>>2]|0;
       $102 = HEAP32[(53768)>>2]|0;
       $103 = ($101>>>0)<($102>>>0);
       if ($103) {
        _abort();
        // unreachable;
       } else {
        $$pre$phiZ2D = $100;$F4$0 = $101;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $91;
      $104 = ((($F4$0)) + 12|0);
      HEAP32[$104>>2] = $91;
      $105 = ((($91)) + 8|0);
      HEAP32[$105>>2] = $F4$0;
      $106 = ((($91)) + 12|0);
      HEAP32[$106>>2] = $94;
     }
     HEAP32[(53760)>>2] = $82;
     HEAP32[(53772)>>2] = $85;
     $$0 = $70;
     return ($$0|0);
    }
    $107 = HEAP32[(53756)>>2]|0;
    $108 = ($107|0)==(0);
    if ($108) {
     $nb$0 = $4;
    } else {
     $109 = (0 - ($107))|0;
     $110 = $107 & $109;
     $111 = (($110) + -1)|0;
     $112 = $111 >>> 12;
     $113 = $112 & 16;
     $114 = $111 >>> $113;
     $115 = $114 >>> 5;
     $116 = $115 & 8;
     $117 = $116 | $113;
     $118 = $114 >>> $116;
     $119 = $118 >>> 2;
     $120 = $119 & 4;
     $121 = $117 | $120;
     $122 = $118 >>> $120;
     $123 = $122 >>> 1;
     $124 = $123 & 2;
     $125 = $121 | $124;
     $126 = $122 >>> $124;
     $127 = $126 >>> 1;
     $128 = $127 & 1;
     $129 = $125 | $128;
     $130 = $126 >>> $128;
     $131 = (($129) + ($130))|0;
     $132 = (54056 + ($131<<2)|0);
     $133 = HEAP32[$132>>2]|0;
     $134 = ((($133)) + 4|0);
     $135 = HEAP32[$134>>2]|0;
     $136 = $135 & -8;
     $137 = (($136) - ($4))|0;
     $rsize$0$i = $137;$t$0$i = $133;$v$0$i = $133;
     while(1) {
      $138 = ((($t$0$i)) + 16|0);
      $139 = HEAP32[$138>>2]|0;
      $140 = ($139|0)==(0|0);
      if ($140) {
       $141 = ((($t$0$i)) + 20|0);
       $142 = HEAP32[$141>>2]|0;
       $143 = ($142|0)==(0|0);
       if ($143) {
        $rsize$0$i$lcssa = $rsize$0$i;$v$0$i$lcssa = $v$0$i;
        break;
       } else {
        $145 = $142;
       }
      } else {
       $145 = $139;
      }
      $144 = ((($145)) + 4|0);
      $146 = HEAP32[$144>>2]|0;
      $147 = $146 & -8;
      $148 = (($147) - ($4))|0;
      $149 = ($148>>>0)<($rsize$0$i>>>0);
      $$rsize$0$i = $149 ? $148 : $rsize$0$i;
      $$v$0$i = $149 ? $145 : $v$0$i;
      $rsize$0$i = $$rsize$0$i;$t$0$i = $145;$v$0$i = $$v$0$i;
     }
     $150 = HEAP32[(53768)>>2]|0;
     $151 = ($v$0$i$lcssa>>>0)<($150>>>0);
     if ($151) {
      _abort();
      // unreachable;
     }
     $152 = (($v$0$i$lcssa) + ($4)|0);
     $153 = ($v$0$i$lcssa>>>0)<($152>>>0);
     if (!($153)) {
      _abort();
      // unreachable;
     }
     $154 = ((($v$0$i$lcssa)) + 24|0);
     $155 = HEAP32[$154>>2]|0;
     $156 = ((($v$0$i$lcssa)) + 12|0);
     $157 = HEAP32[$156>>2]|0;
     $158 = ($157|0)==($v$0$i$lcssa|0);
     do {
      if ($158) {
       $168 = ((($v$0$i$lcssa)) + 20|0);
       $169 = HEAP32[$168>>2]|0;
       $170 = ($169|0)==(0|0);
       if ($170) {
        $171 = ((($v$0$i$lcssa)) + 16|0);
        $172 = HEAP32[$171>>2]|0;
        $173 = ($172|0)==(0|0);
        if ($173) {
         $R$3$i = 0;
         break;
        } else {
         $R$1$i = $172;$RP$1$i = $171;
        }
       } else {
        $R$1$i = $169;$RP$1$i = $168;
       }
       while(1) {
        $174 = ((($R$1$i)) + 20|0);
        $175 = HEAP32[$174>>2]|0;
        $176 = ($175|0)==(0|0);
        if (!($176)) {
         $R$1$i = $175;$RP$1$i = $174;
         continue;
        }
        $177 = ((($R$1$i)) + 16|0);
        $178 = HEAP32[$177>>2]|0;
        $179 = ($178|0)==(0|0);
        if ($179) {
         $R$1$i$lcssa = $R$1$i;$RP$1$i$lcssa = $RP$1$i;
         break;
        } else {
         $R$1$i = $178;$RP$1$i = $177;
        }
       }
       $180 = ($RP$1$i$lcssa>>>0)<($150>>>0);
       if ($180) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$RP$1$i$lcssa>>2] = 0;
        $R$3$i = $R$1$i$lcssa;
        break;
       }
      } else {
       $159 = ((($v$0$i$lcssa)) + 8|0);
       $160 = HEAP32[$159>>2]|0;
       $161 = ($160>>>0)<($150>>>0);
       if ($161) {
        _abort();
        // unreachable;
       }
       $162 = ((($160)) + 12|0);
       $163 = HEAP32[$162>>2]|0;
       $164 = ($163|0)==($v$0$i$lcssa|0);
       if (!($164)) {
        _abort();
        // unreachable;
       }
       $165 = ((($157)) + 8|0);
       $166 = HEAP32[$165>>2]|0;
       $167 = ($166|0)==($v$0$i$lcssa|0);
       if ($167) {
        HEAP32[$162>>2] = $157;
        HEAP32[$165>>2] = $160;
        $R$3$i = $157;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $181 = ($155|0)==(0|0);
     do {
      if (!($181)) {
       $182 = ((($v$0$i$lcssa)) + 28|0);
       $183 = HEAP32[$182>>2]|0;
       $184 = (54056 + ($183<<2)|0);
       $185 = HEAP32[$184>>2]|0;
       $186 = ($v$0$i$lcssa|0)==($185|0);
       if ($186) {
        HEAP32[$184>>2] = $R$3$i;
        $cond$i = ($R$3$i|0)==(0|0);
        if ($cond$i) {
         $187 = 1 << $183;
         $188 = $187 ^ -1;
         $189 = HEAP32[(53756)>>2]|0;
         $190 = $189 & $188;
         HEAP32[(53756)>>2] = $190;
         break;
        }
       } else {
        $191 = HEAP32[(53768)>>2]|0;
        $192 = ($155>>>0)<($191>>>0);
        if ($192) {
         _abort();
         // unreachable;
        }
        $193 = ((($155)) + 16|0);
        $194 = HEAP32[$193>>2]|0;
        $195 = ($194|0)==($v$0$i$lcssa|0);
        if ($195) {
         HEAP32[$193>>2] = $R$3$i;
        } else {
         $196 = ((($155)) + 20|0);
         HEAP32[$196>>2] = $R$3$i;
        }
        $197 = ($R$3$i|0)==(0|0);
        if ($197) {
         break;
        }
       }
       $198 = HEAP32[(53768)>>2]|0;
       $199 = ($R$3$i>>>0)<($198>>>0);
       if ($199) {
        _abort();
        // unreachable;
       }
       $200 = ((($R$3$i)) + 24|0);
       HEAP32[$200>>2] = $155;
       $201 = ((($v$0$i$lcssa)) + 16|0);
       $202 = HEAP32[$201>>2]|0;
       $203 = ($202|0)==(0|0);
       do {
        if (!($203)) {
         $204 = ($202>>>0)<($198>>>0);
         if ($204) {
          _abort();
          // unreachable;
         } else {
          $205 = ((($R$3$i)) + 16|0);
          HEAP32[$205>>2] = $202;
          $206 = ((($202)) + 24|0);
          HEAP32[$206>>2] = $R$3$i;
          break;
         }
        }
       } while(0);
       $207 = ((($v$0$i$lcssa)) + 20|0);
       $208 = HEAP32[$207>>2]|0;
       $209 = ($208|0)==(0|0);
       if (!($209)) {
        $210 = HEAP32[(53768)>>2]|0;
        $211 = ($208>>>0)<($210>>>0);
        if ($211) {
         _abort();
         // unreachable;
        } else {
         $212 = ((($R$3$i)) + 20|0);
         HEAP32[$212>>2] = $208;
         $213 = ((($208)) + 24|0);
         HEAP32[$213>>2] = $R$3$i;
         break;
        }
       }
      }
     } while(0);
     $214 = ($rsize$0$i$lcssa>>>0)<(16);
     if ($214) {
      $215 = (($rsize$0$i$lcssa) + ($4))|0;
      $216 = $215 | 3;
      $217 = ((($v$0$i$lcssa)) + 4|0);
      HEAP32[$217>>2] = $216;
      $218 = (($v$0$i$lcssa) + ($215)|0);
      $219 = ((($218)) + 4|0);
      $220 = HEAP32[$219>>2]|0;
      $221 = $220 | 1;
      HEAP32[$219>>2] = $221;
     } else {
      $222 = $4 | 3;
      $223 = ((($v$0$i$lcssa)) + 4|0);
      HEAP32[$223>>2] = $222;
      $224 = $rsize$0$i$lcssa | 1;
      $225 = ((($152)) + 4|0);
      HEAP32[$225>>2] = $224;
      $226 = (($152) + ($rsize$0$i$lcssa)|0);
      HEAP32[$226>>2] = $rsize$0$i$lcssa;
      $227 = HEAP32[(53760)>>2]|0;
      $228 = ($227|0)==(0);
      if (!($228)) {
       $229 = HEAP32[(53772)>>2]|0;
       $230 = $227 >>> 3;
       $231 = $230 << 1;
       $232 = (53792 + ($231<<2)|0);
       $233 = HEAP32[13438]|0;
       $234 = 1 << $230;
       $235 = $233 & $234;
       $236 = ($235|0)==(0);
       if ($236) {
        $237 = $233 | $234;
        HEAP32[13438] = $237;
        $$pre$i = ((($232)) + 8|0);
        $$pre$phi$iZ2D = $$pre$i;$F1$0$i = $232;
       } else {
        $238 = ((($232)) + 8|0);
        $239 = HEAP32[$238>>2]|0;
        $240 = HEAP32[(53768)>>2]|0;
        $241 = ($239>>>0)<($240>>>0);
        if ($241) {
         _abort();
         // unreachable;
        } else {
         $$pre$phi$iZ2D = $238;$F1$0$i = $239;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $229;
       $242 = ((($F1$0$i)) + 12|0);
       HEAP32[$242>>2] = $229;
       $243 = ((($229)) + 8|0);
       HEAP32[$243>>2] = $F1$0$i;
       $244 = ((($229)) + 12|0);
       HEAP32[$244>>2] = $232;
      }
      HEAP32[(53760)>>2] = $rsize$0$i$lcssa;
      HEAP32[(53772)>>2] = $152;
     }
     $245 = ((($v$0$i$lcssa)) + 8|0);
     $$0 = $245;
     return ($$0|0);
    }
   } else {
    $nb$0 = $4;
   }
  } else {
   $246 = ($bytes>>>0)>(4294967231);
   if ($246) {
    $nb$0 = -1;
   } else {
    $247 = (($bytes) + 11)|0;
    $248 = $247 & -8;
    $249 = HEAP32[(53756)>>2]|0;
    $250 = ($249|0)==(0);
    if ($250) {
     $nb$0 = $248;
    } else {
     $251 = (0 - ($248))|0;
     $252 = $247 >>> 8;
     $253 = ($252|0)==(0);
     if ($253) {
      $idx$0$i = 0;
     } else {
      $254 = ($248>>>0)>(16777215);
      if ($254) {
       $idx$0$i = 31;
      } else {
       $255 = (($252) + 1048320)|0;
       $256 = $255 >>> 16;
       $257 = $256 & 8;
       $258 = $252 << $257;
       $259 = (($258) + 520192)|0;
       $260 = $259 >>> 16;
       $261 = $260 & 4;
       $262 = $261 | $257;
       $263 = $258 << $261;
       $264 = (($263) + 245760)|0;
       $265 = $264 >>> 16;
       $266 = $265 & 2;
       $267 = $262 | $266;
       $268 = (14 - ($267))|0;
       $269 = $263 << $266;
       $270 = $269 >>> 15;
       $271 = (($268) + ($270))|0;
       $272 = $271 << 1;
       $273 = (($271) + 7)|0;
       $274 = $248 >>> $273;
       $275 = $274 & 1;
       $276 = $275 | $272;
       $idx$0$i = $276;
      }
     }
     $277 = (54056 + ($idx$0$i<<2)|0);
     $278 = HEAP32[$277>>2]|0;
     $279 = ($278|0)==(0|0);
     L123: do {
      if ($279) {
       $rsize$3$i = $251;$t$2$i = 0;$v$3$i = 0;
       label = 86;
      } else {
       $280 = ($idx$0$i|0)==(31);
       $281 = $idx$0$i >>> 1;
       $282 = (25 - ($281))|0;
       $283 = $280 ? 0 : $282;
       $284 = $248 << $283;
       $rsize$0$i5 = $251;$rst$0$i = 0;$sizebits$0$i = $284;$t$0$i4 = $278;$v$0$i6 = 0;
       while(1) {
        $285 = ((($t$0$i4)) + 4|0);
        $286 = HEAP32[$285>>2]|0;
        $287 = $286 & -8;
        $288 = (($287) - ($248))|0;
        $289 = ($288>>>0)<($rsize$0$i5>>>0);
        if ($289) {
         $290 = ($287|0)==($248|0);
         if ($290) {
          $rsize$412$i = $288;$t$411$i = $t$0$i4;$v$413$i = $t$0$i4;
          label = 90;
          break L123;
         } else {
          $rsize$1$i = $288;$v$1$i = $t$0$i4;
         }
        } else {
         $rsize$1$i = $rsize$0$i5;$v$1$i = $v$0$i6;
        }
        $291 = ((($t$0$i4)) + 20|0);
        $292 = HEAP32[$291>>2]|0;
        $293 = $sizebits$0$i >>> 31;
        $294 = (((($t$0$i4)) + 16|0) + ($293<<2)|0);
        $295 = HEAP32[$294>>2]|0;
        $296 = ($292|0)==(0|0);
        $297 = ($292|0)==($295|0);
        $or$cond1$i = $296 | $297;
        $rst$1$i = $or$cond1$i ? $rst$0$i : $292;
        $298 = ($295|0)==(0|0);
        $299 = $298&1;
        $300 = $299 ^ 1;
        $sizebits$0$$i = $sizebits$0$i << $300;
        if ($298) {
         $rsize$3$i = $rsize$1$i;$t$2$i = $rst$1$i;$v$3$i = $v$1$i;
         label = 86;
         break;
        } else {
         $rsize$0$i5 = $rsize$1$i;$rst$0$i = $rst$1$i;$sizebits$0$i = $sizebits$0$$i;$t$0$i4 = $295;$v$0$i6 = $v$1$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 86) {
      $301 = ($t$2$i|0)==(0|0);
      $302 = ($v$3$i|0)==(0|0);
      $or$cond$i = $301 & $302;
      if ($or$cond$i) {
       $303 = 2 << $idx$0$i;
       $304 = (0 - ($303))|0;
       $305 = $303 | $304;
       $306 = $249 & $305;
       $307 = ($306|0)==(0);
       if ($307) {
        $nb$0 = $248;
        break;
       }
       $308 = (0 - ($306))|0;
       $309 = $306 & $308;
       $310 = (($309) + -1)|0;
       $311 = $310 >>> 12;
       $312 = $311 & 16;
       $313 = $310 >>> $312;
       $314 = $313 >>> 5;
       $315 = $314 & 8;
       $316 = $315 | $312;
       $317 = $313 >>> $315;
       $318 = $317 >>> 2;
       $319 = $318 & 4;
       $320 = $316 | $319;
       $321 = $317 >>> $319;
       $322 = $321 >>> 1;
       $323 = $322 & 2;
       $324 = $320 | $323;
       $325 = $321 >>> $323;
       $326 = $325 >>> 1;
       $327 = $326 & 1;
       $328 = $324 | $327;
       $329 = $325 >>> $327;
       $330 = (($328) + ($329))|0;
       $331 = (54056 + ($330<<2)|0);
       $332 = HEAP32[$331>>2]|0;
       $t$4$ph$i = $332;
      } else {
       $t$4$ph$i = $t$2$i;
      }
      $333 = ($t$4$ph$i|0)==(0|0);
      if ($333) {
       $rsize$4$lcssa$i = $rsize$3$i;$v$4$lcssa$i = $v$3$i;
      } else {
       $rsize$412$i = $rsize$3$i;$t$411$i = $t$4$ph$i;$v$413$i = $v$3$i;
       label = 90;
      }
     }
     if ((label|0) == 90) {
      while(1) {
       label = 0;
       $334 = ((($t$411$i)) + 4|0);
       $335 = HEAP32[$334>>2]|0;
       $336 = $335 & -8;
       $337 = (($336) - ($248))|0;
       $338 = ($337>>>0)<($rsize$412$i>>>0);
       $$rsize$4$i = $338 ? $337 : $rsize$412$i;
       $t$4$v$4$i = $338 ? $t$411$i : $v$413$i;
       $339 = ((($t$411$i)) + 16|0);
       $340 = HEAP32[$339>>2]|0;
       $341 = ($340|0)==(0|0);
       if (!($341)) {
        $rsize$412$i = $$rsize$4$i;$t$411$i = $340;$v$413$i = $t$4$v$4$i;
        label = 90;
        continue;
       }
       $342 = ((($t$411$i)) + 20|0);
       $343 = HEAP32[$342>>2]|0;
       $344 = ($343|0)==(0|0);
       if ($344) {
        $rsize$4$lcssa$i = $$rsize$4$i;$v$4$lcssa$i = $t$4$v$4$i;
        break;
       } else {
        $rsize$412$i = $$rsize$4$i;$t$411$i = $343;$v$413$i = $t$4$v$4$i;
        label = 90;
       }
      }
     }
     $345 = ($v$4$lcssa$i|0)==(0|0);
     if ($345) {
      $nb$0 = $248;
     } else {
      $346 = HEAP32[(53760)>>2]|0;
      $347 = (($346) - ($248))|0;
      $348 = ($rsize$4$lcssa$i>>>0)<($347>>>0);
      if ($348) {
       $349 = HEAP32[(53768)>>2]|0;
       $350 = ($v$4$lcssa$i>>>0)<($349>>>0);
       if ($350) {
        _abort();
        // unreachable;
       }
       $351 = (($v$4$lcssa$i) + ($248)|0);
       $352 = ($v$4$lcssa$i>>>0)<($351>>>0);
       if (!($352)) {
        _abort();
        // unreachable;
       }
       $353 = ((($v$4$lcssa$i)) + 24|0);
       $354 = HEAP32[$353>>2]|0;
       $355 = ((($v$4$lcssa$i)) + 12|0);
       $356 = HEAP32[$355>>2]|0;
       $357 = ($356|0)==($v$4$lcssa$i|0);
       do {
        if ($357) {
         $367 = ((($v$4$lcssa$i)) + 20|0);
         $368 = HEAP32[$367>>2]|0;
         $369 = ($368|0)==(0|0);
         if ($369) {
          $370 = ((($v$4$lcssa$i)) + 16|0);
          $371 = HEAP32[$370>>2]|0;
          $372 = ($371|0)==(0|0);
          if ($372) {
           $R$3$i11 = 0;
           break;
          } else {
           $R$1$i9 = $371;$RP$1$i8 = $370;
          }
         } else {
          $R$1$i9 = $368;$RP$1$i8 = $367;
         }
         while(1) {
          $373 = ((($R$1$i9)) + 20|0);
          $374 = HEAP32[$373>>2]|0;
          $375 = ($374|0)==(0|0);
          if (!($375)) {
           $R$1$i9 = $374;$RP$1$i8 = $373;
           continue;
          }
          $376 = ((($R$1$i9)) + 16|0);
          $377 = HEAP32[$376>>2]|0;
          $378 = ($377|0)==(0|0);
          if ($378) {
           $R$1$i9$lcssa = $R$1$i9;$RP$1$i8$lcssa = $RP$1$i8;
           break;
          } else {
           $R$1$i9 = $377;$RP$1$i8 = $376;
          }
         }
         $379 = ($RP$1$i8$lcssa>>>0)<($349>>>0);
         if ($379) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$RP$1$i8$lcssa>>2] = 0;
          $R$3$i11 = $R$1$i9$lcssa;
          break;
         }
        } else {
         $358 = ((($v$4$lcssa$i)) + 8|0);
         $359 = HEAP32[$358>>2]|0;
         $360 = ($359>>>0)<($349>>>0);
         if ($360) {
          _abort();
          // unreachable;
         }
         $361 = ((($359)) + 12|0);
         $362 = HEAP32[$361>>2]|0;
         $363 = ($362|0)==($v$4$lcssa$i|0);
         if (!($363)) {
          _abort();
          // unreachable;
         }
         $364 = ((($356)) + 8|0);
         $365 = HEAP32[$364>>2]|0;
         $366 = ($365|0)==($v$4$lcssa$i|0);
         if ($366) {
          HEAP32[$361>>2] = $356;
          HEAP32[$364>>2] = $359;
          $R$3$i11 = $356;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $380 = ($354|0)==(0|0);
       do {
        if (!($380)) {
         $381 = ((($v$4$lcssa$i)) + 28|0);
         $382 = HEAP32[$381>>2]|0;
         $383 = (54056 + ($382<<2)|0);
         $384 = HEAP32[$383>>2]|0;
         $385 = ($v$4$lcssa$i|0)==($384|0);
         if ($385) {
          HEAP32[$383>>2] = $R$3$i11;
          $cond$i12 = ($R$3$i11|0)==(0|0);
          if ($cond$i12) {
           $386 = 1 << $382;
           $387 = $386 ^ -1;
           $388 = HEAP32[(53756)>>2]|0;
           $389 = $388 & $387;
           HEAP32[(53756)>>2] = $389;
           break;
          }
         } else {
          $390 = HEAP32[(53768)>>2]|0;
          $391 = ($354>>>0)<($390>>>0);
          if ($391) {
           _abort();
           // unreachable;
          }
          $392 = ((($354)) + 16|0);
          $393 = HEAP32[$392>>2]|0;
          $394 = ($393|0)==($v$4$lcssa$i|0);
          if ($394) {
           HEAP32[$392>>2] = $R$3$i11;
          } else {
           $395 = ((($354)) + 20|0);
           HEAP32[$395>>2] = $R$3$i11;
          }
          $396 = ($R$3$i11|0)==(0|0);
          if ($396) {
           break;
          }
         }
         $397 = HEAP32[(53768)>>2]|0;
         $398 = ($R$3$i11>>>0)<($397>>>0);
         if ($398) {
          _abort();
          // unreachable;
         }
         $399 = ((($R$3$i11)) + 24|0);
         HEAP32[$399>>2] = $354;
         $400 = ((($v$4$lcssa$i)) + 16|0);
         $401 = HEAP32[$400>>2]|0;
         $402 = ($401|0)==(0|0);
         do {
          if (!($402)) {
           $403 = ($401>>>0)<($397>>>0);
           if ($403) {
            _abort();
            // unreachable;
           } else {
            $404 = ((($R$3$i11)) + 16|0);
            HEAP32[$404>>2] = $401;
            $405 = ((($401)) + 24|0);
            HEAP32[$405>>2] = $R$3$i11;
            break;
           }
          }
         } while(0);
         $406 = ((($v$4$lcssa$i)) + 20|0);
         $407 = HEAP32[$406>>2]|0;
         $408 = ($407|0)==(0|0);
         if (!($408)) {
          $409 = HEAP32[(53768)>>2]|0;
          $410 = ($407>>>0)<($409>>>0);
          if ($410) {
           _abort();
           // unreachable;
          } else {
           $411 = ((($R$3$i11)) + 20|0);
           HEAP32[$411>>2] = $407;
           $412 = ((($407)) + 24|0);
           HEAP32[$412>>2] = $R$3$i11;
           break;
          }
         }
        }
       } while(0);
       $413 = ($rsize$4$lcssa$i>>>0)<(16);
       do {
        if ($413) {
         $414 = (($rsize$4$lcssa$i) + ($248))|0;
         $415 = $414 | 3;
         $416 = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$416>>2] = $415;
         $417 = (($v$4$lcssa$i) + ($414)|0);
         $418 = ((($417)) + 4|0);
         $419 = HEAP32[$418>>2]|0;
         $420 = $419 | 1;
         HEAP32[$418>>2] = $420;
        } else {
         $421 = $248 | 3;
         $422 = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$422>>2] = $421;
         $423 = $rsize$4$lcssa$i | 1;
         $424 = ((($351)) + 4|0);
         HEAP32[$424>>2] = $423;
         $425 = (($351) + ($rsize$4$lcssa$i)|0);
         HEAP32[$425>>2] = $rsize$4$lcssa$i;
         $426 = $rsize$4$lcssa$i >>> 3;
         $427 = ($rsize$4$lcssa$i>>>0)<(256);
         if ($427) {
          $428 = $426 << 1;
          $429 = (53792 + ($428<<2)|0);
          $430 = HEAP32[13438]|0;
          $431 = 1 << $426;
          $432 = $430 & $431;
          $433 = ($432|0)==(0);
          if ($433) {
           $434 = $430 | $431;
           HEAP32[13438] = $434;
           $$pre$i13 = ((($429)) + 8|0);
           $$pre$phi$i14Z2D = $$pre$i13;$F5$0$i = $429;
          } else {
           $435 = ((($429)) + 8|0);
           $436 = HEAP32[$435>>2]|0;
           $437 = HEAP32[(53768)>>2]|0;
           $438 = ($436>>>0)<($437>>>0);
           if ($438) {
            _abort();
            // unreachable;
           } else {
            $$pre$phi$i14Z2D = $435;$F5$0$i = $436;
           }
          }
          HEAP32[$$pre$phi$i14Z2D>>2] = $351;
          $439 = ((($F5$0$i)) + 12|0);
          HEAP32[$439>>2] = $351;
          $440 = ((($351)) + 8|0);
          HEAP32[$440>>2] = $F5$0$i;
          $441 = ((($351)) + 12|0);
          HEAP32[$441>>2] = $429;
          break;
         }
         $442 = $rsize$4$lcssa$i >>> 8;
         $443 = ($442|0)==(0);
         if ($443) {
          $I7$0$i = 0;
         } else {
          $444 = ($rsize$4$lcssa$i>>>0)>(16777215);
          if ($444) {
           $I7$0$i = 31;
          } else {
           $445 = (($442) + 1048320)|0;
           $446 = $445 >>> 16;
           $447 = $446 & 8;
           $448 = $442 << $447;
           $449 = (($448) + 520192)|0;
           $450 = $449 >>> 16;
           $451 = $450 & 4;
           $452 = $451 | $447;
           $453 = $448 << $451;
           $454 = (($453) + 245760)|0;
           $455 = $454 >>> 16;
           $456 = $455 & 2;
           $457 = $452 | $456;
           $458 = (14 - ($457))|0;
           $459 = $453 << $456;
           $460 = $459 >>> 15;
           $461 = (($458) + ($460))|0;
           $462 = $461 << 1;
           $463 = (($461) + 7)|0;
           $464 = $rsize$4$lcssa$i >>> $463;
           $465 = $464 & 1;
           $466 = $465 | $462;
           $I7$0$i = $466;
          }
         }
         $467 = (54056 + ($I7$0$i<<2)|0);
         $468 = ((($351)) + 28|0);
         HEAP32[$468>>2] = $I7$0$i;
         $469 = ((($351)) + 16|0);
         $470 = ((($469)) + 4|0);
         HEAP32[$470>>2] = 0;
         HEAP32[$469>>2] = 0;
         $471 = HEAP32[(53756)>>2]|0;
         $472 = 1 << $I7$0$i;
         $473 = $471 & $472;
         $474 = ($473|0)==(0);
         if ($474) {
          $475 = $471 | $472;
          HEAP32[(53756)>>2] = $475;
          HEAP32[$467>>2] = $351;
          $476 = ((($351)) + 24|0);
          HEAP32[$476>>2] = $467;
          $477 = ((($351)) + 12|0);
          HEAP32[$477>>2] = $351;
          $478 = ((($351)) + 8|0);
          HEAP32[$478>>2] = $351;
          break;
         }
         $479 = HEAP32[$467>>2]|0;
         $480 = ($I7$0$i|0)==(31);
         $481 = $I7$0$i >>> 1;
         $482 = (25 - ($481))|0;
         $483 = $480 ? 0 : $482;
         $484 = $rsize$4$lcssa$i << $483;
         $K12$0$i = $484;$T$0$i = $479;
         while(1) {
          $485 = ((($T$0$i)) + 4|0);
          $486 = HEAP32[$485>>2]|0;
          $487 = $486 & -8;
          $488 = ($487|0)==($rsize$4$lcssa$i|0);
          if ($488) {
           $T$0$i$lcssa = $T$0$i;
           label = 148;
           break;
          }
          $489 = $K12$0$i >>> 31;
          $490 = (((($T$0$i)) + 16|0) + ($489<<2)|0);
          $491 = $K12$0$i << 1;
          $492 = HEAP32[$490>>2]|0;
          $493 = ($492|0)==(0|0);
          if ($493) {
           $$lcssa157 = $490;$T$0$i$lcssa156 = $T$0$i;
           label = 145;
           break;
          } else {
           $K12$0$i = $491;$T$0$i = $492;
          }
         }
         if ((label|0) == 145) {
          $494 = HEAP32[(53768)>>2]|0;
          $495 = ($$lcssa157>>>0)<($494>>>0);
          if ($495) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$$lcssa157>>2] = $351;
           $496 = ((($351)) + 24|0);
           HEAP32[$496>>2] = $T$0$i$lcssa156;
           $497 = ((($351)) + 12|0);
           HEAP32[$497>>2] = $351;
           $498 = ((($351)) + 8|0);
           HEAP32[$498>>2] = $351;
           break;
          }
         }
         else if ((label|0) == 148) {
          $499 = ((($T$0$i$lcssa)) + 8|0);
          $500 = HEAP32[$499>>2]|0;
          $501 = HEAP32[(53768)>>2]|0;
          $502 = ($500>>>0)>=($501>>>0);
          $not$7$i = ($T$0$i$lcssa>>>0)>=($501>>>0);
          $503 = $502 & $not$7$i;
          if ($503) {
           $504 = ((($500)) + 12|0);
           HEAP32[$504>>2] = $351;
           HEAP32[$499>>2] = $351;
           $505 = ((($351)) + 8|0);
           HEAP32[$505>>2] = $500;
           $506 = ((($351)) + 12|0);
           HEAP32[$506>>2] = $T$0$i$lcssa;
           $507 = ((($351)) + 24|0);
           HEAP32[$507>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $508 = ((($v$4$lcssa$i)) + 8|0);
       $$0 = $508;
       return ($$0|0);
      } else {
       $nb$0 = $248;
      }
     }
    }
   }
  }
 } while(0);
 $509 = HEAP32[(53760)>>2]|0;
 $510 = ($509>>>0)<($nb$0>>>0);
 if (!($510)) {
  $511 = (($509) - ($nb$0))|0;
  $512 = HEAP32[(53772)>>2]|0;
  $513 = ($511>>>0)>(15);
  if ($513) {
   $514 = (($512) + ($nb$0)|0);
   HEAP32[(53772)>>2] = $514;
   HEAP32[(53760)>>2] = $511;
   $515 = $511 | 1;
   $516 = ((($514)) + 4|0);
   HEAP32[$516>>2] = $515;
   $517 = (($514) + ($511)|0);
   HEAP32[$517>>2] = $511;
   $518 = $nb$0 | 3;
   $519 = ((($512)) + 4|0);
   HEAP32[$519>>2] = $518;
  } else {
   HEAP32[(53760)>>2] = 0;
   HEAP32[(53772)>>2] = 0;
   $520 = $509 | 3;
   $521 = ((($512)) + 4|0);
   HEAP32[$521>>2] = $520;
   $522 = (($512) + ($509)|0);
   $523 = ((($522)) + 4|0);
   $524 = HEAP32[$523>>2]|0;
   $525 = $524 | 1;
   HEAP32[$523>>2] = $525;
  }
  $526 = ((($512)) + 8|0);
  $$0 = $526;
  return ($$0|0);
 }
 $527 = HEAP32[(53764)>>2]|0;
 $528 = ($527>>>0)>($nb$0>>>0);
 if ($528) {
  $529 = (($527) - ($nb$0))|0;
  HEAP32[(53764)>>2] = $529;
  $530 = HEAP32[(53776)>>2]|0;
  $531 = (($530) + ($nb$0)|0);
  HEAP32[(53776)>>2] = $531;
  $532 = $529 | 1;
  $533 = ((($531)) + 4|0);
  HEAP32[$533>>2] = $532;
  $534 = $nb$0 | 3;
  $535 = ((($530)) + 4|0);
  HEAP32[$535>>2] = $534;
  $536 = ((($530)) + 8|0);
  $$0 = $536;
  return ($$0|0);
 }
 $537 = HEAP32[13556]|0;
 $538 = ($537|0)==(0);
 do {
  if ($538) {
   $539 = (_sysconf(30)|0);
   $540 = (($539) + -1)|0;
   $541 = $540 & $539;
   $542 = ($541|0)==(0);
   if ($542) {
    HEAP32[(54232)>>2] = $539;
    HEAP32[(54228)>>2] = $539;
    HEAP32[(54236)>>2] = -1;
    HEAP32[(54240)>>2] = -1;
    HEAP32[(54244)>>2] = 0;
    HEAP32[(54196)>>2] = 0;
    $543 = (_time((0|0))|0);
    $544 = $543 & -16;
    $545 = $544 ^ 1431655768;
    HEAP32[13556] = $545;
    break;
   } else {
    _abort();
    // unreachable;
   }
  }
 } while(0);
 $546 = (($nb$0) + 48)|0;
 $547 = HEAP32[(54232)>>2]|0;
 $548 = (($nb$0) + 47)|0;
 $549 = (($547) + ($548))|0;
 $550 = (0 - ($547))|0;
 $551 = $549 & $550;
 $552 = ($551>>>0)>($nb$0>>>0);
 if (!($552)) {
  $$0 = 0;
  return ($$0|0);
 }
 $553 = HEAP32[(54192)>>2]|0;
 $554 = ($553|0)==(0);
 if (!($554)) {
  $555 = HEAP32[(54184)>>2]|0;
  $556 = (($555) + ($551))|0;
  $557 = ($556>>>0)<=($555>>>0);
  $558 = ($556>>>0)>($553>>>0);
  $or$cond1$i16 = $557 | $558;
  if ($or$cond1$i16) {
   $$0 = 0;
   return ($$0|0);
  }
 }
 $559 = HEAP32[(54196)>>2]|0;
 $560 = $559 & 4;
 $561 = ($560|0)==(0);
 L257: do {
  if ($561) {
   $562 = HEAP32[(53776)>>2]|0;
   $563 = ($562|0)==(0|0);
   L259: do {
    if ($563) {
     label = 173;
    } else {
     $sp$0$i$i = (54200);
     while(1) {
      $564 = HEAP32[$sp$0$i$i>>2]|0;
      $565 = ($564>>>0)>($562>>>0);
      if (!($565)) {
       $566 = ((($sp$0$i$i)) + 4|0);
       $567 = HEAP32[$566>>2]|0;
       $568 = (($564) + ($567)|0);
       $569 = ($568>>>0)>($562>>>0);
       if ($569) {
        $$lcssa153 = $sp$0$i$i;$$lcssa155 = $566;
        break;
       }
      }
      $570 = ((($sp$0$i$i)) + 8|0);
      $571 = HEAP32[$570>>2]|0;
      $572 = ($571|0)==(0|0);
      if ($572) {
       label = 173;
       break L259;
      } else {
       $sp$0$i$i = $571;
      }
     }
     $595 = HEAP32[(53764)>>2]|0;
     $596 = (($549) - ($595))|0;
     $597 = $596 & $550;
     $598 = ($597>>>0)<(2147483647);
     if ($598) {
      $599 = (_sbrk(($597|0))|0);
      $600 = HEAP32[$$lcssa153>>2]|0;
      $601 = HEAP32[$$lcssa155>>2]|0;
      $602 = (($600) + ($601)|0);
      $603 = ($599|0)==($602|0);
      if ($603) {
       $604 = ($599|0)==((-1)|0);
       if (!($604)) {
        $tbase$746$i = $599;$tsize$745$i = $597;
        label = 193;
        break L257;
       }
      } else {
       $br$2$ph$i = $599;$ssize$2$ph$i = $597;
       label = 183;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 173) {
     $573 = (_sbrk(0)|0);
     $574 = ($573|0)==((-1)|0);
     if (!($574)) {
      $575 = $573;
      $576 = HEAP32[(54228)>>2]|0;
      $577 = (($576) + -1)|0;
      $578 = $577 & $575;
      $579 = ($578|0)==(0);
      if ($579) {
       $ssize$0$i = $551;
      } else {
       $580 = (($577) + ($575))|0;
       $581 = (0 - ($576))|0;
       $582 = $580 & $581;
       $583 = (($551) - ($575))|0;
       $584 = (($583) + ($582))|0;
       $ssize$0$i = $584;
      }
      $585 = HEAP32[(54184)>>2]|0;
      $586 = (($585) + ($ssize$0$i))|0;
      $587 = ($ssize$0$i>>>0)>($nb$0>>>0);
      $588 = ($ssize$0$i>>>0)<(2147483647);
      $or$cond$i17 = $587 & $588;
      if ($or$cond$i17) {
       $589 = HEAP32[(54192)>>2]|0;
       $590 = ($589|0)==(0);
       if (!($590)) {
        $591 = ($586>>>0)<=($585>>>0);
        $592 = ($586>>>0)>($589>>>0);
        $or$cond2$i = $591 | $592;
        if ($or$cond2$i) {
         break;
        }
       }
       $593 = (_sbrk(($ssize$0$i|0))|0);
       $594 = ($593|0)==($573|0);
       if ($594) {
        $tbase$746$i = $573;$tsize$745$i = $ssize$0$i;
        label = 193;
        break L257;
       } else {
        $br$2$ph$i = $593;$ssize$2$ph$i = $ssize$0$i;
        label = 183;
       }
      }
     }
    }
   } while(0);
   L279: do {
    if ((label|0) == 183) {
     $605 = (0 - ($ssize$2$ph$i))|0;
     $606 = ($br$2$ph$i|0)!=((-1)|0);
     $607 = ($ssize$2$ph$i>>>0)<(2147483647);
     $or$cond7$i = $607 & $606;
     $608 = ($546>>>0)>($ssize$2$ph$i>>>0);
     $or$cond8$i = $608 & $or$cond7$i;
     do {
      if ($or$cond8$i) {
       $609 = HEAP32[(54232)>>2]|0;
       $610 = (($548) - ($ssize$2$ph$i))|0;
       $611 = (($610) + ($609))|0;
       $612 = (0 - ($609))|0;
       $613 = $611 & $612;
       $614 = ($613>>>0)<(2147483647);
       if ($614) {
        $615 = (_sbrk(($613|0))|0);
        $616 = ($615|0)==((-1)|0);
        if ($616) {
         (_sbrk(($605|0))|0);
         break L279;
        } else {
         $617 = (($613) + ($ssize$2$ph$i))|0;
         $ssize$5$i = $617;
         break;
        }
       } else {
        $ssize$5$i = $ssize$2$ph$i;
       }
      } else {
       $ssize$5$i = $ssize$2$ph$i;
      }
     } while(0);
     $618 = ($br$2$ph$i|0)==((-1)|0);
     if (!($618)) {
      $tbase$746$i = $br$2$ph$i;$tsize$745$i = $ssize$5$i;
      label = 193;
      break L257;
     }
    }
   } while(0);
   $619 = HEAP32[(54196)>>2]|0;
   $620 = $619 | 4;
   HEAP32[(54196)>>2] = $620;
   label = 190;
  } else {
   label = 190;
  }
 } while(0);
 if ((label|0) == 190) {
  $621 = ($551>>>0)<(2147483647);
  if ($621) {
   $622 = (_sbrk(($551|0))|0);
   $623 = (_sbrk(0)|0);
   $624 = ($622|0)!=((-1)|0);
   $625 = ($623|0)!=((-1)|0);
   $or$cond5$i = $624 & $625;
   $626 = ($622>>>0)<($623>>>0);
   $or$cond10$i = $626 & $or$cond5$i;
   if ($or$cond10$i) {
    $627 = $623;
    $628 = $622;
    $629 = (($627) - ($628))|0;
    $630 = (($nb$0) + 40)|0;
    $$not$i = ($629>>>0)>($630>>>0);
    if ($$not$i) {
     $tbase$746$i = $622;$tsize$745$i = $629;
     label = 193;
    }
   }
  }
 }
 if ((label|0) == 193) {
  $631 = HEAP32[(54184)>>2]|0;
  $632 = (($631) + ($tsize$745$i))|0;
  HEAP32[(54184)>>2] = $632;
  $633 = HEAP32[(54188)>>2]|0;
  $634 = ($632>>>0)>($633>>>0);
  if ($634) {
   HEAP32[(54188)>>2] = $632;
  }
  $635 = HEAP32[(53776)>>2]|0;
  $636 = ($635|0)==(0|0);
  do {
   if ($636) {
    $637 = HEAP32[(53768)>>2]|0;
    $638 = ($637|0)==(0|0);
    $639 = ($tbase$746$i>>>0)<($637>>>0);
    $or$cond11$i = $638 | $639;
    if ($or$cond11$i) {
     HEAP32[(53768)>>2] = $tbase$746$i;
    }
    HEAP32[(54200)>>2] = $tbase$746$i;
    HEAP32[(54204)>>2] = $tsize$745$i;
    HEAP32[(54212)>>2] = 0;
    $640 = HEAP32[13556]|0;
    HEAP32[(53788)>>2] = $640;
    HEAP32[(53784)>>2] = -1;
    $i$01$i$i = 0;
    while(1) {
     $641 = $i$01$i$i << 1;
     $642 = (53792 + ($641<<2)|0);
     $643 = ((($642)) + 12|0);
     HEAP32[$643>>2] = $642;
     $644 = ((($642)) + 8|0);
     HEAP32[$644>>2] = $642;
     $645 = (($i$01$i$i) + 1)|0;
     $exitcond$i$i = ($645|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $i$01$i$i = $645;
     }
    }
    $646 = (($tsize$745$i) + -40)|0;
    $647 = ((($tbase$746$i)) + 8|0);
    $648 = $647;
    $649 = $648 & 7;
    $650 = ($649|0)==(0);
    $651 = (0 - ($648))|0;
    $652 = $651 & 7;
    $653 = $650 ? 0 : $652;
    $654 = (($tbase$746$i) + ($653)|0);
    $655 = (($646) - ($653))|0;
    HEAP32[(53776)>>2] = $654;
    HEAP32[(53764)>>2] = $655;
    $656 = $655 | 1;
    $657 = ((($654)) + 4|0);
    HEAP32[$657>>2] = $656;
    $658 = (($654) + ($655)|0);
    $659 = ((($658)) + 4|0);
    HEAP32[$659>>2] = 40;
    $660 = HEAP32[(54240)>>2]|0;
    HEAP32[(53780)>>2] = $660;
   } else {
    $sp$068$i = (54200);
    while(1) {
     $661 = HEAP32[$sp$068$i>>2]|0;
     $662 = ((($sp$068$i)) + 4|0);
     $663 = HEAP32[$662>>2]|0;
     $664 = (($661) + ($663)|0);
     $665 = ($tbase$746$i|0)==($664|0);
     if ($665) {
      $$lcssa147 = $661;$$lcssa149 = $662;$$lcssa151 = $663;$sp$068$i$lcssa = $sp$068$i;
      label = 203;
      break;
     }
     $666 = ((($sp$068$i)) + 8|0);
     $667 = HEAP32[$666>>2]|0;
     $668 = ($667|0)==(0|0);
     if ($668) {
      break;
     } else {
      $sp$068$i = $667;
     }
    }
    if ((label|0) == 203) {
     $669 = ((($sp$068$i$lcssa)) + 12|0);
     $670 = HEAP32[$669>>2]|0;
     $671 = $670 & 8;
     $672 = ($671|0)==(0);
     if ($672) {
      $673 = ($635>>>0)>=($$lcssa147>>>0);
      $674 = ($635>>>0)<($tbase$746$i>>>0);
      $or$cond48$i = $674 & $673;
      if ($or$cond48$i) {
       $675 = (($$lcssa151) + ($tsize$745$i))|0;
       HEAP32[$$lcssa149>>2] = $675;
       $676 = HEAP32[(53764)>>2]|0;
       $677 = ((($635)) + 8|0);
       $678 = $677;
       $679 = $678 & 7;
       $680 = ($679|0)==(0);
       $681 = (0 - ($678))|0;
       $682 = $681 & 7;
       $683 = $680 ? 0 : $682;
       $684 = (($635) + ($683)|0);
       $685 = (($tsize$745$i) - ($683))|0;
       $686 = (($685) + ($676))|0;
       HEAP32[(53776)>>2] = $684;
       HEAP32[(53764)>>2] = $686;
       $687 = $686 | 1;
       $688 = ((($684)) + 4|0);
       HEAP32[$688>>2] = $687;
       $689 = (($684) + ($686)|0);
       $690 = ((($689)) + 4|0);
       HEAP32[$690>>2] = 40;
       $691 = HEAP32[(54240)>>2]|0;
       HEAP32[(53780)>>2] = $691;
       break;
      }
     }
    }
    $692 = HEAP32[(53768)>>2]|0;
    $693 = ($tbase$746$i>>>0)<($692>>>0);
    if ($693) {
     HEAP32[(53768)>>2] = $tbase$746$i;
     $757 = $tbase$746$i;
    } else {
     $757 = $692;
    }
    $694 = (($tbase$746$i) + ($tsize$745$i)|0);
    $sp$167$i = (54200);
    while(1) {
     $695 = HEAP32[$sp$167$i>>2]|0;
     $696 = ($695|0)==($694|0);
     if ($696) {
      $$lcssa144 = $sp$167$i;$sp$167$i$lcssa = $sp$167$i;
      label = 211;
      break;
     }
     $697 = ((($sp$167$i)) + 8|0);
     $698 = HEAP32[$697>>2]|0;
     $699 = ($698|0)==(0|0);
     if ($699) {
      $sp$0$i$i$i = (54200);
      break;
     } else {
      $sp$167$i = $698;
     }
    }
    if ((label|0) == 211) {
     $700 = ((($sp$167$i$lcssa)) + 12|0);
     $701 = HEAP32[$700>>2]|0;
     $702 = $701 & 8;
     $703 = ($702|0)==(0);
     if ($703) {
      HEAP32[$$lcssa144>>2] = $tbase$746$i;
      $704 = ((($sp$167$i$lcssa)) + 4|0);
      $705 = HEAP32[$704>>2]|0;
      $706 = (($705) + ($tsize$745$i))|0;
      HEAP32[$704>>2] = $706;
      $707 = ((($tbase$746$i)) + 8|0);
      $708 = $707;
      $709 = $708 & 7;
      $710 = ($709|0)==(0);
      $711 = (0 - ($708))|0;
      $712 = $711 & 7;
      $713 = $710 ? 0 : $712;
      $714 = (($tbase$746$i) + ($713)|0);
      $715 = ((($694)) + 8|0);
      $716 = $715;
      $717 = $716 & 7;
      $718 = ($717|0)==(0);
      $719 = (0 - ($716))|0;
      $720 = $719 & 7;
      $721 = $718 ? 0 : $720;
      $722 = (($694) + ($721)|0);
      $723 = $722;
      $724 = $714;
      $725 = (($723) - ($724))|0;
      $726 = (($714) + ($nb$0)|0);
      $727 = (($725) - ($nb$0))|0;
      $728 = $nb$0 | 3;
      $729 = ((($714)) + 4|0);
      HEAP32[$729>>2] = $728;
      $730 = ($722|0)==($635|0);
      do {
       if ($730) {
        $731 = HEAP32[(53764)>>2]|0;
        $732 = (($731) + ($727))|0;
        HEAP32[(53764)>>2] = $732;
        HEAP32[(53776)>>2] = $726;
        $733 = $732 | 1;
        $734 = ((($726)) + 4|0);
        HEAP32[$734>>2] = $733;
       } else {
        $735 = HEAP32[(53772)>>2]|0;
        $736 = ($722|0)==($735|0);
        if ($736) {
         $737 = HEAP32[(53760)>>2]|0;
         $738 = (($737) + ($727))|0;
         HEAP32[(53760)>>2] = $738;
         HEAP32[(53772)>>2] = $726;
         $739 = $738 | 1;
         $740 = ((($726)) + 4|0);
         HEAP32[$740>>2] = $739;
         $741 = (($726) + ($738)|0);
         HEAP32[$741>>2] = $738;
         break;
        }
        $742 = ((($722)) + 4|0);
        $743 = HEAP32[$742>>2]|0;
        $744 = $743 & 3;
        $745 = ($744|0)==(1);
        if ($745) {
         $746 = $743 & -8;
         $747 = $743 >>> 3;
         $748 = ($743>>>0)<(256);
         L331: do {
          if ($748) {
           $749 = ((($722)) + 8|0);
           $750 = HEAP32[$749>>2]|0;
           $751 = ((($722)) + 12|0);
           $752 = HEAP32[$751>>2]|0;
           $753 = $747 << 1;
           $754 = (53792 + ($753<<2)|0);
           $755 = ($750|0)==($754|0);
           do {
            if (!($755)) {
             $756 = ($750>>>0)<($757>>>0);
             if ($756) {
              _abort();
              // unreachable;
             }
             $758 = ((($750)) + 12|0);
             $759 = HEAP32[$758>>2]|0;
             $760 = ($759|0)==($722|0);
             if ($760) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $761 = ($752|0)==($750|0);
           if ($761) {
            $762 = 1 << $747;
            $763 = $762 ^ -1;
            $764 = HEAP32[13438]|0;
            $765 = $764 & $763;
            HEAP32[13438] = $765;
            break;
           }
           $766 = ($752|0)==($754|0);
           do {
            if ($766) {
             $$pre9$i$i = ((($752)) + 8|0);
             $$pre$phi10$i$iZ2D = $$pre9$i$i;
            } else {
             $767 = ($752>>>0)<($757>>>0);
             if ($767) {
              _abort();
              // unreachable;
             }
             $768 = ((($752)) + 8|0);
             $769 = HEAP32[$768>>2]|0;
             $770 = ($769|0)==($722|0);
             if ($770) {
              $$pre$phi10$i$iZ2D = $768;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $771 = ((($750)) + 12|0);
           HEAP32[$771>>2] = $752;
           HEAP32[$$pre$phi10$i$iZ2D>>2] = $750;
          } else {
           $772 = ((($722)) + 24|0);
           $773 = HEAP32[$772>>2]|0;
           $774 = ((($722)) + 12|0);
           $775 = HEAP32[$774>>2]|0;
           $776 = ($775|0)==($722|0);
           do {
            if ($776) {
             $786 = ((($722)) + 16|0);
             $787 = ((($786)) + 4|0);
             $788 = HEAP32[$787>>2]|0;
             $789 = ($788|0)==(0|0);
             if ($789) {
              $790 = HEAP32[$786>>2]|0;
              $791 = ($790|0)==(0|0);
              if ($791) {
               $R$3$i$i = 0;
               break;
              } else {
               $R$1$i$i = $790;$RP$1$i$i = $786;
              }
             } else {
              $R$1$i$i = $788;$RP$1$i$i = $787;
             }
             while(1) {
              $792 = ((($R$1$i$i)) + 20|0);
              $793 = HEAP32[$792>>2]|0;
              $794 = ($793|0)==(0|0);
              if (!($794)) {
               $R$1$i$i = $793;$RP$1$i$i = $792;
               continue;
              }
              $795 = ((($R$1$i$i)) + 16|0);
              $796 = HEAP32[$795>>2]|0;
              $797 = ($796|0)==(0|0);
              if ($797) {
               $R$1$i$i$lcssa = $R$1$i$i;$RP$1$i$i$lcssa = $RP$1$i$i;
               break;
              } else {
               $R$1$i$i = $796;$RP$1$i$i = $795;
              }
             }
             $798 = ($RP$1$i$i$lcssa>>>0)<($757>>>0);
             if ($798) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$RP$1$i$i$lcssa>>2] = 0;
              $R$3$i$i = $R$1$i$i$lcssa;
              break;
             }
            } else {
             $777 = ((($722)) + 8|0);
             $778 = HEAP32[$777>>2]|0;
             $779 = ($778>>>0)<($757>>>0);
             if ($779) {
              _abort();
              // unreachable;
             }
             $780 = ((($778)) + 12|0);
             $781 = HEAP32[$780>>2]|0;
             $782 = ($781|0)==($722|0);
             if (!($782)) {
              _abort();
              // unreachable;
             }
             $783 = ((($775)) + 8|0);
             $784 = HEAP32[$783>>2]|0;
             $785 = ($784|0)==($722|0);
             if ($785) {
              HEAP32[$780>>2] = $775;
              HEAP32[$783>>2] = $778;
              $R$3$i$i = $775;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $799 = ($773|0)==(0|0);
           if ($799) {
            break;
           }
           $800 = ((($722)) + 28|0);
           $801 = HEAP32[$800>>2]|0;
           $802 = (54056 + ($801<<2)|0);
           $803 = HEAP32[$802>>2]|0;
           $804 = ($722|0)==($803|0);
           do {
            if ($804) {
             HEAP32[$802>>2] = $R$3$i$i;
             $cond$i$i = ($R$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $805 = 1 << $801;
             $806 = $805 ^ -1;
             $807 = HEAP32[(53756)>>2]|0;
             $808 = $807 & $806;
             HEAP32[(53756)>>2] = $808;
             break L331;
            } else {
             $809 = HEAP32[(53768)>>2]|0;
             $810 = ($773>>>0)<($809>>>0);
             if ($810) {
              _abort();
              // unreachable;
             }
             $811 = ((($773)) + 16|0);
             $812 = HEAP32[$811>>2]|0;
             $813 = ($812|0)==($722|0);
             if ($813) {
              HEAP32[$811>>2] = $R$3$i$i;
             } else {
              $814 = ((($773)) + 20|0);
              HEAP32[$814>>2] = $R$3$i$i;
             }
             $815 = ($R$3$i$i|0)==(0|0);
             if ($815) {
              break L331;
             }
            }
           } while(0);
           $816 = HEAP32[(53768)>>2]|0;
           $817 = ($R$3$i$i>>>0)<($816>>>0);
           if ($817) {
            _abort();
            // unreachable;
           }
           $818 = ((($R$3$i$i)) + 24|0);
           HEAP32[$818>>2] = $773;
           $819 = ((($722)) + 16|0);
           $820 = HEAP32[$819>>2]|0;
           $821 = ($820|0)==(0|0);
           do {
            if (!($821)) {
             $822 = ($820>>>0)<($816>>>0);
             if ($822) {
              _abort();
              // unreachable;
             } else {
              $823 = ((($R$3$i$i)) + 16|0);
              HEAP32[$823>>2] = $820;
              $824 = ((($820)) + 24|0);
              HEAP32[$824>>2] = $R$3$i$i;
              break;
             }
            }
           } while(0);
           $825 = ((($819)) + 4|0);
           $826 = HEAP32[$825>>2]|0;
           $827 = ($826|0)==(0|0);
           if ($827) {
            break;
           }
           $828 = HEAP32[(53768)>>2]|0;
           $829 = ($826>>>0)<($828>>>0);
           if ($829) {
            _abort();
            // unreachable;
           } else {
            $830 = ((($R$3$i$i)) + 20|0);
            HEAP32[$830>>2] = $826;
            $831 = ((($826)) + 24|0);
            HEAP32[$831>>2] = $R$3$i$i;
            break;
           }
          }
         } while(0);
         $832 = (($722) + ($746)|0);
         $833 = (($746) + ($727))|0;
         $oldfirst$0$i$i = $832;$qsize$0$i$i = $833;
        } else {
         $oldfirst$0$i$i = $722;$qsize$0$i$i = $727;
        }
        $834 = ((($oldfirst$0$i$i)) + 4|0);
        $835 = HEAP32[$834>>2]|0;
        $836 = $835 & -2;
        HEAP32[$834>>2] = $836;
        $837 = $qsize$0$i$i | 1;
        $838 = ((($726)) + 4|0);
        HEAP32[$838>>2] = $837;
        $839 = (($726) + ($qsize$0$i$i)|0);
        HEAP32[$839>>2] = $qsize$0$i$i;
        $840 = $qsize$0$i$i >>> 3;
        $841 = ($qsize$0$i$i>>>0)<(256);
        if ($841) {
         $842 = $840 << 1;
         $843 = (53792 + ($842<<2)|0);
         $844 = HEAP32[13438]|0;
         $845 = 1 << $840;
         $846 = $844 & $845;
         $847 = ($846|0)==(0);
         do {
          if ($847) {
           $848 = $844 | $845;
           HEAP32[13438] = $848;
           $$pre$i16$i = ((($843)) + 8|0);
           $$pre$phi$i17$iZ2D = $$pre$i16$i;$F4$0$i$i = $843;
          } else {
           $849 = ((($843)) + 8|0);
           $850 = HEAP32[$849>>2]|0;
           $851 = HEAP32[(53768)>>2]|0;
           $852 = ($850>>>0)<($851>>>0);
           if (!($852)) {
            $$pre$phi$i17$iZ2D = $849;$F4$0$i$i = $850;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i17$iZ2D>>2] = $726;
         $853 = ((($F4$0$i$i)) + 12|0);
         HEAP32[$853>>2] = $726;
         $854 = ((($726)) + 8|0);
         HEAP32[$854>>2] = $F4$0$i$i;
         $855 = ((($726)) + 12|0);
         HEAP32[$855>>2] = $843;
         break;
        }
        $856 = $qsize$0$i$i >>> 8;
        $857 = ($856|0)==(0);
        do {
         if ($857) {
          $I7$0$i$i = 0;
         } else {
          $858 = ($qsize$0$i$i>>>0)>(16777215);
          if ($858) {
           $I7$0$i$i = 31;
           break;
          }
          $859 = (($856) + 1048320)|0;
          $860 = $859 >>> 16;
          $861 = $860 & 8;
          $862 = $856 << $861;
          $863 = (($862) + 520192)|0;
          $864 = $863 >>> 16;
          $865 = $864 & 4;
          $866 = $865 | $861;
          $867 = $862 << $865;
          $868 = (($867) + 245760)|0;
          $869 = $868 >>> 16;
          $870 = $869 & 2;
          $871 = $866 | $870;
          $872 = (14 - ($871))|0;
          $873 = $867 << $870;
          $874 = $873 >>> 15;
          $875 = (($872) + ($874))|0;
          $876 = $875 << 1;
          $877 = (($875) + 7)|0;
          $878 = $qsize$0$i$i >>> $877;
          $879 = $878 & 1;
          $880 = $879 | $876;
          $I7$0$i$i = $880;
         }
        } while(0);
        $881 = (54056 + ($I7$0$i$i<<2)|0);
        $882 = ((($726)) + 28|0);
        HEAP32[$882>>2] = $I7$0$i$i;
        $883 = ((($726)) + 16|0);
        $884 = ((($883)) + 4|0);
        HEAP32[$884>>2] = 0;
        HEAP32[$883>>2] = 0;
        $885 = HEAP32[(53756)>>2]|0;
        $886 = 1 << $I7$0$i$i;
        $887 = $885 & $886;
        $888 = ($887|0)==(0);
        if ($888) {
         $889 = $885 | $886;
         HEAP32[(53756)>>2] = $889;
         HEAP32[$881>>2] = $726;
         $890 = ((($726)) + 24|0);
         HEAP32[$890>>2] = $881;
         $891 = ((($726)) + 12|0);
         HEAP32[$891>>2] = $726;
         $892 = ((($726)) + 8|0);
         HEAP32[$892>>2] = $726;
         break;
        }
        $893 = HEAP32[$881>>2]|0;
        $894 = ($I7$0$i$i|0)==(31);
        $895 = $I7$0$i$i >>> 1;
        $896 = (25 - ($895))|0;
        $897 = $894 ? 0 : $896;
        $898 = $qsize$0$i$i << $897;
        $K8$0$i$i = $898;$T$0$i18$i = $893;
        while(1) {
         $899 = ((($T$0$i18$i)) + 4|0);
         $900 = HEAP32[$899>>2]|0;
         $901 = $900 & -8;
         $902 = ($901|0)==($qsize$0$i$i|0);
         if ($902) {
          $T$0$i18$i$lcssa = $T$0$i18$i;
          label = 281;
          break;
         }
         $903 = $K8$0$i$i >>> 31;
         $904 = (((($T$0$i18$i)) + 16|0) + ($903<<2)|0);
         $905 = $K8$0$i$i << 1;
         $906 = HEAP32[$904>>2]|0;
         $907 = ($906|0)==(0|0);
         if ($907) {
          $$lcssa = $904;$T$0$i18$i$lcssa139 = $T$0$i18$i;
          label = 278;
          break;
         } else {
          $K8$0$i$i = $905;$T$0$i18$i = $906;
         }
        }
        if ((label|0) == 278) {
         $908 = HEAP32[(53768)>>2]|0;
         $909 = ($$lcssa>>>0)<($908>>>0);
         if ($909) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$$lcssa>>2] = $726;
          $910 = ((($726)) + 24|0);
          HEAP32[$910>>2] = $T$0$i18$i$lcssa139;
          $911 = ((($726)) + 12|0);
          HEAP32[$911>>2] = $726;
          $912 = ((($726)) + 8|0);
          HEAP32[$912>>2] = $726;
          break;
         }
        }
        else if ((label|0) == 281) {
         $913 = ((($T$0$i18$i$lcssa)) + 8|0);
         $914 = HEAP32[$913>>2]|0;
         $915 = HEAP32[(53768)>>2]|0;
         $916 = ($914>>>0)>=($915>>>0);
         $not$$i20$i = ($T$0$i18$i$lcssa>>>0)>=($915>>>0);
         $917 = $916 & $not$$i20$i;
         if ($917) {
          $918 = ((($914)) + 12|0);
          HEAP32[$918>>2] = $726;
          HEAP32[$913>>2] = $726;
          $919 = ((($726)) + 8|0);
          HEAP32[$919>>2] = $914;
          $920 = ((($726)) + 12|0);
          HEAP32[$920>>2] = $T$0$i18$i$lcssa;
          $921 = ((($726)) + 24|0);
          HEAP32[$921>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $1052 = ((($714)) + 8|0);
      $$0 = $1052;
      return ($$0|0);
     } else {
      $sp$0$i$i$i = (54200);
     }
    }
    while(1) {
     $922 = HEAP32[$sp$0$i$i$i>>2]|0;
     $923 = ($922>>>0)>($635>>>0);
     if (!($923)) {
      $924 = ((($sp$0$i$i$i)) + 4|0);
      $925 = HEAP32[$924>>2]|0;
      $926 = (($922) + ($925)|0);
      $927 = ($926>>>0)>($635>>>0);
      if ($927) {
       $$lcssa142 = $926;
       break;
      }
     }
     $928 = ((($sp$0$i$i$i)) + 8|0);
     $929 = HEAP32[$928>>2]|0;
     $sp$0$i$i$i = $929;
    }
    $930 = ((($$lcssa142)) + -47|0);
    $931 = ((($930)) + 8|0);
    $932 = $931;
    $933 = $932 & 7;
    $934 = ($933|0)==(0);
    $935 = (0 - ($932))|0;
    $936 = $935 & 7;
    $937 = $934 ? 0 : $936;
    $938 = (($930) + ($937)|0);
    $939 = ((($635)) + 16|0);
    $940 = ($938>>>0)<($939>>>0);
    $941 = $940 ? $635 : $938;
    $942 = ((($941)) + 8|0);
    $943 = ((($941)) + 24|0);
    $944 = (($tsize$745$i) + -40)|0;
    $945 = ((($tbase$746$i)) + 8|0);
    $946 = $945;
    $947 = $946 & 7;
    $948 = ($947|0)==(0);
    $949 = (0 - ($946))|0;
    $950 = $949 & 7;
    $951 = $948 ? 0 : $950;
    $952 = (($tbase$746$i) + ($951)|0);
    $953 = (($944) - ($951))|0;
    HEAP32[(53776)>>2] = $952;
    HEAP32[(53764)>>2] = $953;
    $954 = $953 | 1;
    $955 = ((($952)) + 4|0);
    HEAP32[$955>>2] = $954;
    $956 = (($952) + ($953)|0);
    $957 = ((($956)) + 4|0);
    HEAP32[$957>>2] = 40;
    $958 = HEAP32[(54240)>>2]|0;
    HEAP32[(53780)>>2] = $958;
    $959 = ((($941)) + 4|0);
    HEAP32[$959>>2] = 27;
    ;HEAP32[$942>>2]=HEAP32[(54200)>>2]|0;HEAP32[$942+4>>2]=HEAP32[(54200)+4>>2]|0;HEAP32[$942+8>>2]=HEAP32[(54200)+8>>2]|0;HEAP32[$942+12>>2]=HEAP32[(54200)+12>>2]|0;
    HEAP32[(54200)>>2] = $tbase$746$i;
    HEAP32[(54204)>>2] = $tsize$745$i;
    HEAP32[(54212)>>2] = 0;
    HEAP32[(54208)>>2] = $942;
    $p$0$i$i = $943;
    while(1) {
     $960 = ((($p$0$i$i)) + 4|0);
     HEAP32[$960>>2] = 7;
     $961 = ((($960)) + 4|0);
     $962 = ($961>>>0)<($$lcssa142>>>0);
     if ($962) {
      $p$0$i$i = $960;
     } else {
      break;
     }
    }
    $963 = ($941|0)==($635|0);
    if (!($963)) {
     $964 = $941;
     $965 = $635;
     $966 = (($964) - ($965))|0;
     $967 = HEAP32[$959>>2]|0;
     $968 = $967 & -2;
     HEAP32[$959>>2] = $968;
     $969 = $966 | 1;
     $970 = ((($635)) + 4|0);
     HEAP32[$970>>2] = $969;
     HEAP32[$941>>2] = $966;
     $971 = $966 >>> 3;
     $972 = ($966>>>0)<(256);
     if ($972) {
      $973 = $971 << 1;
      $974 = (53792 + ($973<<2)|0);
      $975 = HEAP32[13438]|0;
      $976 = 1 << $971;
      $977 = $975 & $976;
      $978 = ($977|0)==(0);
      if ($978) {
       $979 = $975 | $976;
       HEAP32[13438] = $979;
       $$pre$i$i = ((($974)) + 8|0);
       $$pre$phi$i$iZ2D = $$pre$i$i;$F$0$i$i = $974;
      } else {
       $980 = ((($974)) + 8|0);
       $981 = HEAP32[$980>>2]|0;
       $982 = HEAP32[(53768)>>2]|0;
       $983 = ($981>>>0)<($982>>>0);
       if ($983) {
        _abort();
        // unreachable;
       } else {
        $$pre$phi$i$iZ2D = $980;$F$0$i$i = $981;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $635;
      $984 = ((($F$0$i$i)) + 12|0);
      HEAP32[$984>>2] = $635;
      $985 = ((($635)) + 8|0);
      HEAP32[$985>>2] = $F$0$i$i;
      $986 = ((($635)) + 12|0);
      HEAP32[$986>>2] = $974;
      break;
     }
     $987 = $966 >>> 8;
     $988 = ($987|0)==(0);
     if ($988) {
      $I1$0$i$i = 0;
     } else {
      $989 = ($966>>>0)>(16777215);
      if ($989) {
       $I1$0$i$i = 31;
      } else {
       $990 = (($987) + 1048320)|0;
       $991 = $990 >>> 16;
       $992 = $991 & 8;
       $993 = $987 << $992;
       $994 = (($993) + 520192)|0;
       $995 = $994 >>> 16;
       $996 = $995 & 4;
       $997 = $996 | $992;
       $998 = $993 << $996;
       $999 = (($998) + 245760)|0;
       $1000 = $999 >>> 16;
       $1001 = $1000 & 2;
       $1002 = $997 | $1001;
       $1003 = (14 - ($1002))|0;
       $1004 = $998 << $1001;
       $1005 = $1004 >>> 15;
       $1006 = (($1003) + ($1005))|0;
       $1007 = $1006 << 1;
       $1008 = (($1006) + 7)|0;
       $1009 = $966 >>> $1008;
       $1010 = $1009 & 1;
       $1011 = $1010 | $1007;
       $I1$0$i$i = $1011;
      }
     }
     $1012 = (54056 + ($I1$0$i$i<<2)|0);
     $1013 = ((($635)) + 28|0);
     HEAP32[$1013>>2] = $I1$0$i$i;
     $1014 = ((($635)) + 20|0);
     HEAP32[$1014>>2] = 0;
     HEAP32[$939>>2] = 0;
     $1015 = HEAP32[(53756)>>2]|0;
     $1016 = 1 << $I1$0$i$i;
     $1017 = $1015 & $1016;
     $1018 = ($1017|0)==(0);
     if ($1018) {
      $1019 = $1015 | $1016;
      HEAP32[(53756)>>2] = $1019;
      HEAP32[$1012>>2] = $635;
      $1020 = ((($635)) + 24|0);
      HEAP32[$1020>>2] = $1012;
      $1021 = ((($635)) + 12|0);
      HEAP32[$1021>>2] = $635;
      $1022 = ((($635)) + 8|0);
      HEAP32[$1022>>2] = $635;
      break;
     }
     $1023 = HEAP32[$1012>>2]|0;
     $1024 = ($I1$0$i$i|0)==(31);
     $1025 = $I1$0$i$i >>> 1;
     $1026 = (25 - ($1025))|0;
     $1027 = $1024 ? 0 : $1026;
     $1028 = $966 << $1027;
     $K2$0$i$i = $1028;$T$0$i$i = $1023;
     while(1) {
      $1029 = ((($T$0$i$i)) + 4|0);
      $1030 = HEAP32[$1029>>2]|0;
      $1031 = $1030 & -8;
      $1032 = ($1031|0)==($966|0);
      if ($1032) {
       $T$0$i$i$lcssa = $T$0$i$i;
       label = 307;
       break;
      }
      $1033 = $K2$0$i$i >>> 31;
      $1034 = (((($T$0$i$i)) + 16|0) + ($1033<<2)|0);
      $1035 = $K2$0$i$i << 1;
      $1036 = HEAP32[$1034>>2]|0;
      $1037 = ($1036|0)==(0|0);
      if ($1037) {
       $$lcssa141 = $1034;$T$0$i$i$lcssa140 = $T$0$i$i;
       label = 304;
       break;
      } else {
       $K2$0$i$i = $1035;$T$0$i$i = $1036;
      }
     }
     if ((label|0) == 304) {
      $1038 = HEAP32[(53768)>>2]|0;
      $1039 = ($$lcssa141>>>0)<($1038>>>0);
      if ($1039) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$$lcssa141>>2] = $635;
       $1040 = ((($635)) + 24|0);
       HEAP32[$1040>>2] = $T$0$i$i$lcssa140;
       $1041 = ((($635)) + 12|0);
       HEAP32[$1041>>2] = $635;
       $1042 = ((($635)) + 8|0);
       HEAP32[$1042>>2] = $635;
       break;
      }
     }
     else if ((label|0) == 307) {
      $1043 = ((($T$0$i$i$lcssa)) + 8|0);
      $1044 = HEAP32[$1043>>2]|0;
      $1045 = HEAP32[(53768)>>2]|0;
      $1046 = ($1044>>>0)>=($1045>>>0);
      $not$$i$i = ($T$0$i$i$lcssa>>>0)>=($1045>>>0);
      $1047 = $1046 & $not$$i$i;
      if ($1047) {
       $1048 = ((($1044)) + 12|0);
       HEAP32[$1048>>2] = $635;
       HEAP32[$1043>>2] = $635;
       $1049 = ((($635)) + 8|0);
       HEAP32[$1049>>2] = $1044;
       $1050 = ((($635)) + 12|0);
       HEAP32[$1050>>2] = $T$0$i$i$lcssa;
       $1051 = ((($635)) + 24|0);
       HEAP32[$1051>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $1053 = HEAP32[(53764)>>2]|0;
  $1054 = ($1053>>>0)>($nb$0>>>0);
  if ($1054) {
   $1055 = (($1053) - ($nb$0))|0;
   HEAP32[(53764)>>2] = $1055;
   $1056 = HEAP32[(53776)>>2]|0;
   $1057 = (($1056) + ($nb$0)|0);
   HEAP32[(53776)>>2] = $1057;
   $1058 = $1055 | 1;
   $1059 = ((($1057)) + 4|0);
   HEAP32[$1059>>2] = $1058;
   $1060 = $nb$0 | 3;
   $1061 = ((($1056)) + 4|0);
   HEAP32[$1061>>2] = $1060;
   $1062 = ((($1056)) + 8|0);
   $$0 = $1062;
   return ($$0|0);
  }
 }
 $1063 = (___errno_location()|0);
 HEAP32[$1063>>2] = 12;
 $$0 = 0;
 return ($$0|0);
}
function _free($mem) {
 $mem = $mem|0;
 var $$lcssa = 0, $$pre = 0, $$pre$phi41Z2D = 0, $$pre$phi43Z2D = 0, $$pre$phiZ2D = 0, $$pre40 = 0, $$pre42 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0;
 var $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0;
 var $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0;
 var $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0;
 var $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0;
 var $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0;
 var $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0;
 var $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0;
 var $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0;
 var $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0;
 var $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0;
 var $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0;
 var $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0;
 var $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0;
 var $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0;
 var $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0;
 var $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $F18$0 = 0, $I20$0 = 0, $K21$0 = 0, $R$1 = 0, $R$1$lcssa = 0, $R$3 = 0, $R8$1 = 0, $R8$1$lcssa = 0, $R8$3 = 0, $RP$1 = 0, $RP$1$lcssa = 0, $RP10$1 = 0, $RP10$1$lcssa = 0;
 var $T$0 = 0, $T$0$lcssa = 0, $T$0$lcssa48 = 0, $cond20 = 0, $cond21 = 0, $not$ = 0, $p$1 = 0, $psize$1 = 0, $psize$2 = 0, $sp$0$i = 0, $sp$0$in$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($mem|0)==(0|0);
 if ($0) {
  return;
 }
 $1 = ((($mem)) + -8|0);
 $2 = HEAP32[(53768)>>2]|0;
 $3 = ($1>>>0)<($2>>>0);
 if ($3) {
  _abort();
  // unreachable;
 }
 $4 = ((($mem)) + -4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 & 3;
 $7 = ($6|0)==(1);
 if ($7) {
  _abort();
  // unreachable;
 }
 $8 = $5 & -8;
 $9 = (($1) + ($8)|0);
 $10 = $5 & 1;
 $11 = ($10|0)==(0);
 do {
  if ($11) {
   $12 = HEAP32[$1>>2]|0;
   $13 = ($6|0)==(0);
   if ($13) {
    return;
   }
   $14 = (0 - ($12))|0;
   $15 = (($1) + ($14)|0);
   $16 = (($12) + ($8))|0;
   $17 = ($15>>>0)<($2>>>0);
   if ($17) {
    _abort();
    // unreachable;
   }
   $18 = HEAP32[(53772)>>2]|0;
   $19 = ($15|0)==($18|0);
   if ($19) {
    $104 = ((($9)) + 4|0);
    $105 = HEAP32[$104>>2]|0;
    $106 = $105 & 3;
    $107 = ($106|0)==(3);
    if (!($107)) {
     $p$1 = $15;$psize$1 = $16;
     break;
    }
    HEAP32[(53760)>>2] = $16;
    $108 = $105 & -2;
    HEAP32[$104>>2] = $108;
    $109 = $16 | 1;
    $110 = ((($15)) + 4|0);
    HEAP32[$110>>2] = $109;
    $111 = (($15) + ($16)|0);
    HEAP32[$111>>2] = $16;
    return;
   }
   $20 = $12 >>> 3;
   $21 = ($12>>>0)<(256);
   if ($21) {
    $22 = ((($15)) + 8|0);
    $23 = HEAP32[$22>>2]|0;
    $24 = ((($15)) + 12|0);
    $25 = HEAP32[$24>>2]|0;
    $26 = $20 << 1;
    $27 = (53792 + ($26<<2)|0);
    $28 = ($23|0)==($27|0);
    if (!($28)) {
     $29 = ($23>>>0)<($2>>>0);
     if ($29) {
      _abort();
      // unreachable;
     }
     $30 = ((($23)) + 12|0);
     $31 = HEAP32[$30>>2]|0;
     $32 = ($31|0)==($15|0);
     if (!($32)) {
      _abort();
      // unreachable;
     }
    }
    $33 = ($25|0)==($23|0);
    if ($33) {
     $34 = 1 << $20;
     $35 = $34 ^ -1;
     $36 = HEAP32[13438]|0;
     $37 = $36 & $35;
     HEAP32[13438] = $37;
     $p$1 = $15;$psize$1 = $16;
     break;
    }
    $38 = ($25|0)==($27|0);
    if ($38) {
     $$pre42 = ((($25)) + 8|0);
     $$pre$phi43Z2D = $$pre42;
    } else {
     $39 = ($25>>>0)<($2>>>0);
     if ($39) {
      _abort();
      // unreachable;
     }
     $40 = ((($25)) + 8|0);
     $41 = HEAP32[$40>>2]|0;
     $42 = ($41|0)==($15|0);
     if ($42) {
      $$pre$phi43Z2D = $40;
     } else {
      _abort();
      // unreachable;
     }
    }
    $43 = ((($23)) + 12|0);
    HEAP32[$43>>2] = $25;
    HEAP32[$$pre$phi43Z2D>>2] = $23;
    $p$1 = $15;$psize$1 = $16;
    break;
   }
   $44 = ((($15)) + 24|0);
   $45 = HEAP32[$44>>2]|0;
   $46 = ((($15)) + 12|0);
   $47 = HEAP32[$46>>2]|0;
   $48 = ($47|0)==($15|0);
   do {
    if ($48) {
     $58 = ((($15)) + 16|0);
     $59 = ((($58)) + 4|0);
     $60 = HEAP32[$59>>2]|0;
     $61 = ($60|0)==(0|0);
     if ($61) {
      $62 = HEAP32[$58>>2]|0;
      $63 = ($62|0)==(0|0);
      if ($63) {
       $R$3 = 0;
       break;
      } else {
       $R$1 = $62;$RP$1 = $58;
      }
     } else {
      $R$1 = $60;$RP$1 = $59;
     }
     while(1) {
      $64 = ((($R$1)) + 20|0);
      $65 = HEAP32[$64>>2]|0;
      $66 = ($65|0)==(0|0);
      if (!($66)) {
       $R$1 = $65;$RP$1 = $64;
       continue;
      }
      $67 = ((($R$1)) + 16|0);
      $68 = HEAP32[$67>>2]|0;
      $69 = ($68|0)==(0|0);
      if ($69) {
       $R$1$lcssa = $R$1;$RP$1$lcssa = $RP$1;
       break;
      } else {
       $R$1 = $68;$RP$1 = $67;
      }
     }
     $70 = ($RP$1$lcssa>>>0)<($2>>>0);
     if ($70) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$RP$1$lcssa>>2] = 0;
      $R$3 = $R$1$lcssa;
      break;
     }
    } else {
     $49 = ((($15)) + 8|0);
     $50 = HEAP32[$49>>2]|0;
     $51 = ($50>>>0)<($2>>>0);
     if ($51) {
      _abort();
      // unreachable;
     }
     $52 = ((($50)) + 12|0);
     $53 = HEAP32[$52>>2]|0;
     $54 = ($53|0)==($15|0);
     if (!($54)) {
      _abort();
      // unreachable;
     }
     $55 = ((($47)) + 8|0);
     $56 = HEAP32[$55>>2]|0;
     $57 = ($56|0)==($15|0);
     if ($57) {
      HEAP32[$52>>2] = $47;
      HEAP32[$55>>2] = $50;
      $R$3 = $47;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $71 = ($45|0)==(0|0);
   if ($71) {
    $p$1 = $15;$psize$1 = $16;
   } else {
    $72 = ((($15)) + 28|0);
    $73 = HEAP32[$72>>2]|0;
    $74 = (54056 + ($73<<2)|0);
    $75 = HEAP32[$74>>2]|0;
    $76 = ($15|0)==($75|0);
    if ($76) {
     HEAP32[$74>>2] = $R$3;
     $cond20 = ($R$3|0)==(0|0);
     if ($cond20) {
      $77 = 1 << $73;
      $78 = $77 ^ -1;
      $79 = HEAP32[(53756)>>2]|0;
      $80 = $79 & $78;
      HEAP32[(53756)>>2] = $80;
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    } else {
     $81 = HEAP32[(53768)>>2]|0;
     $82 = ($45>>>0)<($81>>>0);
     if ($82) {
      _abort();
      // unreachable;
     }
     $83 = ((($45)) + 16|0);
     $84 = HEAP32[$83>>2]|0;
     $85 = ($84|0)==($15|0);
     if ($85) {
      HEAP32[$83>>2] = $R$3;
     } else {
      $86 = ((($45)) + 20|0);
      HEAP32[$86>>2] = $R$3;
     }
     $87 = ($R$3|0)==(0|0);
     if ($87) {
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    }
    $88 = HEAP32[(53768)>>2]|0;
    $89 = ($R$3>>>0)<($88>>>0);
    if ($89) {
     _abort();
     // unreachable;
    }
    $90 = ((($R$3)) + 24|0);
    HEAP32[$90>>2] = $45;
    $91 = ((($15)) + 16|0);
    $92 = HEAP32[$91>>2]|0;
    $93 = ($92|0)==(0|0);
    do {
     if (!($93)) {
      $94 = ($92>>>0)<($88>>>0);
      if ($94) {
       _abort();
       // unreachable;
      } else {
       $95 = ((($R$3)) + 16|0);
       HEAP32[$95>>2] = $92;
       $96 = ((($92)) + 24|0);
       HEAP32[$96>>2] = $R$3;
       break;
      }
     }
    } while(0);
    $97 = ((($91)) + 4|0);
    $98 = HEAP32[$97>>2]|0;
    $99 = ($98|0)==(0|0);
    if ($99) {
     $p$1 = $15;$psize$1 = $16;
    } else {
     $100 = HEAP32[(53768)>>2]|0;
     $101 = ($98>>>0)<($100>>>0);
     if ($101) {
      _abort();
      // unreachable;
     } else {
      $102 = ((($R$3)) + 20|0);
      HEAP32[$102>>2] = $98;
      $103 = ((($98)) + 24|0);
      HEAP32[$103>>2] = $R$3;
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    }
   }
  } else {
   $p$1 = $1;$psize$1 = $8;
  }
 } while(0);
 $112 = ($p$1>>>0)<($9>>>0);
 if (!($112)) {
  _abort();
  // unreachable;
 }
 $113 = ((($9)) + 4|0);
 $114 = HEAP32[$113>>2]|0;
 $115 = $114 & 1;
 $116 = ($115|0)==(0);
 if ($116) {
  _abort();
  // unreachable;
 }
 $117 = $114 & 2;
 $118 = ($117|0)==(0);
 if ($118) {
  $119 = HEAP32[(53776)>>2]|0;
  $120 = ($9|0)==($119|0);
  if ($120) {
   $121 = HEAP32[(53764)>>2]|0;
   $122 = (($121) + ($psize$1))|0;
   HEAP32[(53764)>>2] = $122;
   HEAP32[(53776)>>2] = $p$1;
   $123 = $122 | 1;
   $124 = ((($p$1)) + 4|0);
   HEAP32[$124>>2] = $123;
   $125 = HEAP32[(53772)>>2]|0;
   $126 = ($p$1|0)==($125|0);
   if (!($126)) {
    return;
   }
   HEAP32[(53772)>>2] = 0;
   HEAP32[(53760)>>2] = 0;
   return;
  }
  $127 = HEAP32[(53772)>>2]|0;
  $128 = ($9|0)==($127|0);
  if ($128) {
   $129 = HEAP32[(53760)>>2]|0;
   $130 = (($129) + ($psize$1))|0;
   HEAP32[(53760)>>2] = $130;
   HEAP32[(53772)>>2] = $p$1;
   $131 = $130 | 1;
   $132 = ((($p$1)) + 4|0);
   HEAP32[$132>>2] = $131;
   $133 = (($p$1) + ($130)|0);
   HEAP32[$133>>2] = $130;
   return;
  }
  $134 = $114 & -8;
  $135 = (($134) + ($psize$1))|0;
  $136 = $114 >>> 3;
  $137 = ($114>>>0)<(256);
  do {
   if ($137) {
    $138 = ((($9)) + 8|0);
    $139 = HEAP32[$138>>2]|0;
    $140 = ((($9)) + 12|0);
    $141 = HEAP32[$140>>2]|0;
    $142 = $136 << 1;
    $143 = (53792 + ($142<<2)|0);
    $144 = ($139|0)==($143|0);
    if (!($144)) {
     $145 = HEAP32[(53768)>>2]|0;
     $146 = ($139>>>0)<($145>>>0);
     if ($146) {
      _abort();
      // unreachable;
     }
     $147 = ((($139)) + 12|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = ($148|0)==($9|0);
     if (!($149)) {
      _abort();
      // unreachable;
     }
    }
    $150 = ($141|0)==($139|0);
    if ($150) {
     $151 = 1 << $136;
     $152 = $151 ^ -1;
     $153 = HEAP32[13438]|0;
     $154 = $153 & $152;
     HEAP32[13438] = $154;
     break;
    }
    $155 = ($141|0)==($143|0);
    if ($155) {
     $$pre40 = ((($141)) + 8|0);
     $$pre$phi41Z2D = $$pre40;
    } else {
     $156 = HEAP32[(53768)>>2]|0;
     $157 = ($141>>>0)<($156>>>0);
     if ($157) {
      _abort();
      // unreachable;
     }
     $158 = ((($141)) + 8|0);
     $159 = HEAP32[$158>>2]|0;
     $160 = ($159|0)==($9|0);
     if ($160) {
      $$pre$phi41Z2D = $158;
     } else {
      _abort();
      // unreachable;
     }
    }
    $161 = ((($139)) + 12|0);
    HEAP32[$161>>2] = $141;
    HEAP32[$$pre$phi41Z2D>>2] = $139;
   } else {
    $162 = ((($9)) + 24|0);
    $163 = HEAP32[$162>>2]|0;
    $164 = ((($9)) + 12|0);
    $165 = HEAP32[$164>>2]|0;
    $166 = ($165|0)==($9|0);
    do {
     if ($166) {
      $177 = ((($9)) + 16|0);
      $178 = ((($177)) + 4|0);
      $179 = HEAP32[$178>>2]|0;
      $180 = ($179|0)==(0|0);
      if ($180) {
       $181 = HEAP32[$177>>2]|0;
       $182 = ($181|0)==(0|0);
       if ($182) {
        $R8$3 = 0;
        break;
       } else {
        $R8$1 = $181;$RP10$1 = $177;
       }
      } else {
       $R8$1 = $179;$RP10$1 = $178;
      }
      while(1) {
       $183 = ((($R8$1)) + 20|0);
       $184 = HEAP32[$183>>2]|0;
       $185 = ($184|0)==(0|0);
       if (!($185)) {
        $R8$1 = $184;$RP10$1 = $183;
        continue;
       }
       $186 = ((($R8$1)) + 16|0);
       $187 = HEAP32[$186>>2]|0;
       $188 = ($187|0)==(0|0);
       if ($188) {
        $R8$1$lcssa = $R8$1;$RP10$1$lcssa = $RP10$1;
        break;
       } else {
        $R8$1 = $187;$RP10$1 = $186;
       }
      }
      $189 = HEAP32[(53768)>>2]|0;
      $190 = ($RP10$1$lcssa>>>0)<($189>>>0);
      if ($190) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$RP10$1$lcssa>>2] = 0;
       $R8$3 = $R8$1$lcssa;
       break;
      }
     } else {
      $167 = ((($9)) + 8|0);
      $168 = HEAP32[$167>>2]|0;
      $169 = HEAP32[(53768)>>2]|0;
      $170 = ($168>>>0)<($169>>>0);
      if ($170) {
       _abort();
       // unreachable;
      }
      $171 = ((($168)) + 12|0);
      $172 = HEAP32[$171>>2]|0;
      $173 = ($172|0)==($9|0);
      if (!($173)) {
       _abort();
       // unreachable;
      }
      $174 = ((($165)) + 8|0);
      $175 = HEAP32[$174>>2]|0;
      $176 = ($175|0)==($9|0);
      if ($176) {
       HEAP32[$171>>2] = $165;
       HEAP32[$174>>2] = $168;
       $R8$3 = $165;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $191 = ($163|0)==(0|0);
    if (!($191)) {
     $192 = ((($9)) + 28|0);
     $193 = HEAP32[$192>>2]|0;
     $194 = (54056 + ($193<<2)|0);
     $195 = HEAP32[$194>>2]|0;
     $196 = ($9|0)==($195|0);
     if ($196) {
      HEAP32[$194>>2] = $R8$3;
      $cond21 = ($R8$3|0)==(0|0);
      if ($cond21) {
       $197 = 1 << $193;
       $198 = $197 ^ -1;
       $199 = HEAP32[(53756)>>2]|0;
       $200 = $199 & $198;
       HEAP32[(53756)>>2] = $200;
       break;
      }
     } else {
      $201 = HEAP32[(53768)>>2]|0;
      $202 = ($163>>>0)<($201>>>0);
      if ($202) {
       _abort();
       // unreachable;
      }
      $203 = ((($163)) + 16|0);
      $204 = HEAP32[$203>>2]|0;
      $205 = ($204|0)==($9|0);
      if ($205) {
       HEAP32[$203>>2] = $R8$3;
      } else {
       $206 = ((($163)) + 20|0);
       HEAP32[$206>>2] = $R8$3;
      }
      $207 = ($R8$3|0)==(0|0);
      if ($207) {
       break;
      }
     }
     $208 = HEAP32[(53768)>>2]|0;
     $209 = ($R8$3>>>0)<($208>>>0);
     if ($209) {
      _abort();
      // unreachable;
     }
     $210 = ((($R8$3)) + 24|0);
     HEAP32[$210>>2] = $163;
     $211 = ((($9)) + 16|0);
     $212 = HEAP32[$211>>2]|0;
     $213 = ($212|0)==(0|0);
     do {
      if (!($213)) {
       $214 = ($212>>>0)<($208>>>0);
       if ($214) {
        _abort();
        // unreachable;
       } else {
        $215 = ((($R8$3)) + 16|0);
        HEAP32[$215>>2] = $212;
        $216 = ((($212)) + 24|0);
        HEAP32[$216>>2] = $R8$3;
        break;
       }
      }
     } while(0);
     $217 = ((($211)) + 4|0);
     $218 = HEAP32[$217>>2]|0;
     $219 = ($218|0)==(0|0);
     if (!($219)) {
      $220 = HEAP32[(53768)>>2]|0;
      $221 = ($218>>>0)<($220>>>0);
      if ($221) {
       _abort();
       // unreachable;
      } else {
       $222 = ((($R8$3)) + 20|0);
       HEAP32[$222>>2] = $218;
       $223 = ((($218)) + 24|0);
       HEAP32[$223>>2] = $R8$3;
       break;
      }
     }
    }
   }
  } while(0);
  $224 = $135 | 1;
  $225 = ((($p$1)) + 4|0);
  HEAP32[$225>>2] = $224;
  $226 = (($p$1) + ($135)|0);
  HEAP32[$226>>2] = $135;
  $227 = HEAP32[(53772)>>2]|0;
  $228 = ($p$1|0)==($227|0);
  if ($228) {
   HEAP32[(53760)>>2] = $135;
   return;
  } else {
   $psize$2 = $135;
  }
 } else {
  $229 = $114 & -2;
  HEAP32[$113>>2] = $229;
  $230 = $psize$1 | 1;
  $231 = ((($p$1)) + 4|0);
  HEAP32[$231>>2] = $230;
  $232 = (($p$1) + ($psize$1)|0);
  HEAP32[$232>>2] = $psize$1;
  $psize$2 = $psize$1;
 }
 $233 = $psize$2 >>> 3;
 $234 = ($psize$2>>>0)<(256);
 if ($234) {
  $235 = $233 << 1;
  $236 = (53792 + ($235<<2)|0);
  $237 = HEAP32[13438]|0;
  $238 = 1 << $233;
  $239 = $237 & $238;
  $240 = ($239|0)==(0);
  if ($240) {
   $241 = $237 | $238;
   HEAP32[13438] = $241;
   $$pre = ((($236)) + 8|0);
   $$pre$phiZ2D = $$pre;$F18$0 = $236;
  } else {
   $242 = ((($236)) + 8|0);
   $243 = HEAP32[$242>>2]|0;
   $244 = HEAP32[(53768)>>2]|0;
   $245 = ($243>>>0)<($244>>>0);
   if ($245) {
    _abort();
    // unreachable;
   } else {
    $$pre$phiZ2D = $242;$F18$0 = $243;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $p$1;
  $246 = ((($F18$0)) + 12|0);
  HEAP32[$246>>2] = $p$1;
  $247 = ((($p$1)) + 8|0);
  HEAP32[$247>>2] = $F18$0;
  $248 = ((($p$1)) + 12|0);
  HEAP32[$248>>2] = $236;
  return;
 }
 $249 = $psize$2 >>> 8;
 $250 = ($249|0)==(0);
 if ($250) {
  $I20$0 = 0;
 } else {
  $251 = ($psize$2>>>0)>(16777215);
  if ($251) {
   $I20$0 = 31;
  } else {
   $252 = (($249) + 1048320)|0;
   $253 = $252 >>> 16;
   $254 = $253 & 8;
   $255 = $249 << $254;
   $256 = (($255) + 520192)|0;
   $257 = $256 >>> 16;
   $258 = $257 & 4;
   $259 = $258 | $254;
   $260 = $255 << $258;
   $261 = (($260) + 245760)|0;
   $262 = $261 >>> 16;
   $263 = $262 & 2;
   $264 = $259 | $263;
   $265 = (14 - ($264))|0;
   $266 = $260 << $263;
   $267 = $266 >>> 15;
   $268 = (($265) + ($267))|0;
   $269 = $268 << 1;
   $270 = (($268) + 7)|0;
   $271 = $psize$2 >>> $270;
   $272 = $271 & 1;
   $273 = $272 | $269;
   $I20$0 = $273;
  }
 }
 $274 = (54056 + ($I20$0<<2)|0);
 $275 = ((($p$1)) + 28|0);
 HEAP32[$275>>2] = $I20$0;
 $276 = ((($p$1)) + 16|0);
 $277 = ((($p$1)) + 20|0);
 HEAP32[$277>>2] = 0;
 HEAP32[$276>>2] = 0;
 $278 = HEAP32[(53756)>>2]|0;
 $279 = 1 << $I20$0;
 $280 = $278 & $279;
 $281 = ($280|0)==(0);
 do {
  if ($281) {
   $282 = $278 | $279;
   HEAP32[(53756)>>2] = $282;
   HEAP32[$274>>2] = $p$1;
   $283 = ((($p$1)) + 24|0);
   HEAP32[$283>>2] = $274;
   $284 = ((($p$1)) + 12|0);
   HEAP32[$284>>2] = $p$1;
   $285 = ((($p$1)) + 8|0);
   HEAP32[$285>>2] = $p$1;
  } else {
   $286 = HEAP32[$274>>2]|0;
   $287 = ($I20$0|0)==(31);
   $288 = $I20$0 >>> 1;
   $289 = (25 - ($288))|0;
   $290 = $287 ? 0 : $289;
   $291 = $psize$2 << $290;
   $K21$0 = $291;$T$0 = $286;
   while(1) {
    $292 = ((($T$0)) + 4|0);
    $293 = HEAP32[$292>>2]|0;
    $294 = $293 & -8;
    $295 = ($294|0)==($psize$2|0);
    if ($295) {
     $T$0$lcssa = $T$0;
     label = 130;
     break;
    }
    $296 = $K21$0 >>> 31;
    $297 = (((($T$0)) + 16|0) + ($296<<2)|0);
    $298 = $K21$0 << 1;
    $299 = HEAP32[$297>>2]|0;
    $300 = ($299|0)==(0|0);
    if ($300) {
     $$lcssa = $297;$T$0$lcssa48 = $T$0;
     label = 127;
     break;
    } else {
     $K21$0 = $298;$T$0 = $299;
    }
   }
   if ((label|0) == 127) {
    $301 = HEAP32[(53768)>>2]|0;
    $302 = ($$lcssa>>>0)<($301>>>0);
    if ($302) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$$lcssa>>2] = $p$1;
     $303 = ((($p$1)) + 24|0);
     HEAP32[$303>>2] = $T$0$lcssa48;
     $304 = ((($p$1)) + 12|0);
     HEAP32[$304>>2] = $p$1;
     $305 = ((($p$1)) + 8|0);
     HEAP32[$305>>2] = $p$1;
     break;
    }
   }
   else if ((label|0) == 130) {
    $306 = ((($T$0$lcssa)) + 8|0);
    $307 = HEAP32[$306>>2]|0;
    $308 = HEAP32[(53768)>>2]|0;
    $309 = ($307>>>0)>=($308>>>0);
    $not$ = ($T$0$lcssa>>>0)>=($308>>>0);
    $310 = $309 & $not$;
    if ($310) {
     $311 = ((($307)) + 12|0);
     HEAP32[$311>>2] = $p$1;
     HEAP32[$306>>2] = $p$1;
     $312 = ((($p$1)) + 8|0);
     HEAP32[$312>>2] = $307;
     $313 = ((($p$1)) + 12|0);
     HEAP32[$313>>2] = $T$0$lcssa;
     $314 = ((($p$1)) + 24|0);
     HEAP32[$314>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $315 = HEAP32[(53784)>>2]|0;
 $316 = (($315) + -1)|0;
 HEAP32[(53784)>>2] = $316;
 $317 = ($316|0)==(0);
 if ($317) {
  $sp$0$in$i = (54208);
 } else {
  return;
 }
 while(1) {
  $sp$0$i = HEAP32[$sp$0$in$i>>2]|0;
  $318 = ($sp$0$i|0)==(0|0);
  $319 = ((($sp$0$i)) + 8|0);
  if ($318) {
   break;
  } else {
   $sp$0$in$i = $319;
  }
 }
 HEAP32[(53784)>>2] = -1;
 return;
}
function runPostSets() {
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var stop = 0, value4 = 0, stop4 = 0, unaligned = 0;
    stop = (ptr + num)|0;
    if ((num|0) >= 20) {
      // This is unaligned, but quite large, so work hard to get to aligned settings
      value = value & 0xff;
      unaligned = ptr & 3;
      value4 = value | (value << 8) | (value << 16) | (value << 24);
      stop4 = stop & ~3;
      if (unaligned) {
        unaligned = (ptr + 4 - unaligned)|0;
        while ((ptr|0) < (unaligned|0)) { // no need to check for stop, since we have large num
          HEAP8[((ptr)>>0)]=value;
          ptr = (ptr+1)|0;
        }
      }
      while ((ptr|0) < (stop4|0)) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    while ((ptr|0) < (stop|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (ptr-num)|0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if ((num|0) >= 4096) return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    ret = dest|0;
    if ((dest&3) == (src&3)) {
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      while ((num|0) >= 4) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
        num = (num-4)|0;
      }
    }
    while ((num|0) > 0) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
      num = (num-1)|0;
    }
    return ret|0;
}
function _bitshift64Ashr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = (high|0) < 0 ? -1 : 0;
    return (high >> (bits - 32))|0;
  }
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
  }

// ======== compiled code from system/lib/compiler-rt , see readme therein
function ___muldsi3($a, $b) {
  $a = $a | 0;
  $b = $b | 0;
  var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
  $1 = $a & 65535;
  $2 = $b & 65535;
  $3 = Math_imul($2, $1) | 0;
  $6 = $a >>> 16;
  $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0;
  $11 = $b >>> 16;
  $12 = Math_imul($11, $1) | 0;
  return (tempRet0 = (($8 >>> 16) + (Math_imul($11, $6) | 0) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, 0 | ($8 + $12 << 16 | $3 & 65535)) | 0;
}
function ___divdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $1$0 = 0, $1$1 = 0, $2$0 = 0, $2$1 = 0, $4$0 = 0, $4$1 = 0, $6$0 = 0, $7$0 = 0, $7$1 = 0, $8$0 = 0, $10$0 = 0;
  $1$0 = $a$1 >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $1$1 = (($a$1 | 0) < 0 ? -1 : 0) >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $2$0 = $b$1 >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $2$1 = (($b$1 | 0) < 0 ? -1 : 0) >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $4$0 = _i64Subtract($1$0 ^ $a$0 | 0, $1$1 ^ $a$1 | 0, $1$0 | 0, $1$1 | 0) | 0;
  $4$1 = tempRet0;
  $6$0 = _i64Subtract($2$0 ^ $b$0 | 0, $2$1 ^ $b$1 | 0, $2$0 | 0, $2$1 | 0) | 0;
  $7$0 = $2$0 ^ $1$0;
  $7$1 = $2$1 ^ $1$1;
  $8$0 = ___udivmoddi4($4$0, $4$1, $6$0, tempRet0, 0) | 0;
  $10$0 = _i64Subtract($8$0 ^ $7$0 | 0, tempRet0 ^ $7$1 | 0, $7$0 | 0, $7$1 | 0) | 0;
  return $10$0 | 0;
}
function ___remdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $rem = 0, $1$0 = 0, $1$1 = 0, $2$0 = 0, $2$1 = 0, $4$0 = 0, $4$1 = 0, $6$0 = 0, $10$0 = 0, $10$1 = 0, __stackBase__ = 0;
  __stackBase__ = STACKTOP;
  STACKTOP = STACKTOP + 16 | 0;
  $rem = __stackBase__ | 0;
  $1$0 = $a$1 >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $1$1 = (($a$1 | 0) < 0 ? -1 : 0) >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $2$0 = $b$1 >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $2$1 = (($b$1 | 0) < 0 ? -1 : 0) >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $4$0 = _i64Subtract($1$0 ^ $a$0 | 0, $1$1 ^ $a$1 | 0, $1$0 | 0, $1$1 | 0) | 0;
  $4$1 = tempRet0;
  $6$0 = _i64Subtract($2$0 ^ $b$0 | 0, $2$1 ^ $b$1 | 0, $2$0 | 0, $2$1 | 0) | 0;
  ___udivmoddi4($4$0, $4$1, $6$0, tempRet0, $rem) | 0;
  $10$0 = _i64Subtract(HEAP32[$rem >> 2] ^ $1$0 | 0, HEAP32[$rem + 4 >> 2] ^ $1$1 | 0, $1$0 | 0, $1$1 | 0) | 0;
  $10$1 = tempRet0;
  STACKTOP = __stackBase__;
  return (tempRet0 = $10$1, $10$0) | 0;
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0, $2 = 0;
  $x_sroa_0_0_extract_trunc = $a$0;
  $y_sroa_0_0_extract_trunc = $b$0;
  $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0;
  $1$1 = tempRet0;
  $2 = Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0;
  return (tempRet0 = ((Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $2 | 0) + $1$1 | $1$1 & 0, 0 | $1$0 & -1) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $1$0 = 0;
  $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
  return $1$0 | 0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $rem = 0, __stackBase__ = 0;
  __stackBase__ = STACKTOP;
  STACKTOP = STACKTOP + 16 | 0;
  $rem = __stackBase__ | 0;
  ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
  STACKTOP = __stackBase__;
  return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  $rem = $rem | 0;
  var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
  $n_sroa_0_0_extract_trunc = $a$0;
  $n_sroa_1_4_extract_shift$0 = $a$1;
  $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
  $d_sroa_0_0_extract_trunc = $b$0;
  $d_sroa_1_4_extract_shift$0 = $b$1;
  $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
  if (($n_sroa_1_4_extract_trunc | 0) == 0) {
    $4 = ($rem | 0) != 0;
    if (($d_sroa_1_4_extract_trunc | 0) == 0) {
      if ($4) {
        HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
        HEAP32[$rem + 4 >> 2] = 0;
      }
      $_0$1 = 0;
      $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
      return (tempRet0 = $_0$1, $_0$0) | 0;
    } else {
      if (!$4) {
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      HEAP32[$rem >> 2] = $a$0 & -1;
      HEAP32[$rem + 4 >> 2] = $a$1 & 0;
      $_0$1 = 0;
      $_0$0 = 0;
      return (tempRet0 = $_0$1, $_0$0) | 0;
    }
  }
  $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
  do {
    if (($d_sroa_0_0_extract_trunc | 0) == 0) {
      if ($17) {
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      if (($n_sroa_0_0_extract_trunc | 0) == 0) {
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = 0;
          HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
      if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
        }
        $_0$1 = 0;
        $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
      $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
      if ($51 >>> 0 <= 30) {
        $57 = $51 + 1 | 0;
        $58 = 31 - $51 | 0;
        $sr_1_ph = $57;
        $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
        $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
        $q_sroa_0_1_ph = 0;
        $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
        break;
      }
      if (($rem | 0) == 0) {
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      HEAP32[$rem >> 2] = 0 | $a$0 & -1;
      HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
      $_0$1 = 0;
      $_0$0 = 0;
      return (tempRet0 = $_0$1, $_0$0) | 0;
    } else {
      if (!$17) {
        $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($119 >>> 0 <= 31) {
          $125 = $119 + 1 | 0;
          $126 = 31 - $119 | 0;
          $130 = $119 - 31 >> 31;
          $sr_1_ph = $125;
          $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
      if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
        $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
        $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        $89 = 64 - $88 | 0;
        $91 = 32 - $88 | 0;
        $92 = $91 >> 31;
        $95 = $88 - 32 | 0;
        $105 = $95 >> 31;
        $sr_1_ph = $88;
        $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
        $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
        $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
        $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
        break;
      }
      if (($rem | 0) != 0) {
        HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
        HEAP32[$rem + 4 >> 2] = 0;
      }
      if (($d_sroa_0_0_extract_trunc | 0) == 1) {
        $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$0 = 0 | $a$0 & -1;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
        $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
        $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
  } while (0);
  if (($sr_1_ph | 0) == 0) {
    $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
    $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
    $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
    $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
    $carry_0_lcssa$1 = 0;
    $carry_0_lcssa$0 = 0;
  } else {
    $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
    $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
    $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
    $137$1 = tempRet0;
    $q_sroa_1_1198 = $q_sroa_1_1_ph;
    $q_sroa_0_1199 = $q_sroa_0_1_ph;
    $r_sroa_1_1200 = $r_sroa_1_1_ph;
    $r_sroa_0_1201 = $r_sroa_0_1_ph;
    $sr_1202 = $sr_1_ph;
    $carry_0203 = 0;
    while (1) {
      $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
      $149 = $carry_0203 | $q_sroa_0_1199 << 1;
      $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
      $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
      _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
      $150$1 = tempRet0;
      $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
      $152 = $151$0 & 1;
      $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
      $r_sroa_0_0_extract_trunc = $154$0;
      $r_sroa_1_4_extract_trunc = tempRet0;
      $155 = $sr_1202 - 1 | 0;
      if (($155 | 0) == 0) {
        break;
      } else {
        $q_sroa_1_1198 = $147;
        $q_sroa_0_1199 = $149;
        $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
        $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
        $sr_1202 = $155;
        $carry_0203 = $152;
      }
    }
    $q_sroa_1_1_lcssa = $147;
    $q_sroa_0_1_lcssa = $149;
    $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
    $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
    $carry_0_lcssa$1 = 0;
    $carry_0_lcssa$0 = $152;
  }
  $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
  $q_sroa_0_0_insert_ext75$1 = 0;
  $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
  if (($rem | 0) != 0) {
    HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
    HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
  }
  $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
  $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
  return (tempRet0 = $_0$1, $_0$0) | 0;
}
// =======================================================================



  
function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&1](a1|0)|0;
}


function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&7](a1|0,a2|0,a3|0)|0;
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&7](a1|0);
}

function b0(p0) {
 p0 = p0|0; nullFunc_ii(0);return 0;
}
function b1(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(1);return 0;
}
function b2(p0) {
 p0 = p0|0; nullFunc_vi(2);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b0,___stdio_close];
var FUNCTION_TABLE_iiii = [b1,b1,___stdio_write,___stdio_seek,___stdout_write,b1,b1,b1];
var FUNCTION_TABLE_vi = [b2,b2,b2,b2,b2,_cleanup_599,b2,b2];

  return { _i64Subtract: _i64Subtract, _fflush: _fflush, _codec2_create: _codec2_create, _memset: _memset, _malloc: _malloc, _i64Add: _i64Add, _memcpy: _memcpy, _codec2_samples_per_frame: _codec2_samples_per_frame, _codec2_decode: _codec2_decode, _codec2_destroy: _codec2_destroy, _bitshift64Lshr: _bitshift64Lshr, _free: _free, _codec2_bits_per_frame: _codec2_bits_per_frame, ___errno_location: ___errno_location, _bitshift64Shl: _bitshift64Shl, runPostSets: runPostSets, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setThrew: setThrew, setTempRet0: setTempRet0, getTempRet0: getTempRet0, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_vi: dynCall_vi };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Subtract.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__fflush.apply(null, arguments);
};

var real__codec2_create = asm["_codec2_create"]; asm["_codec2_create"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__codec2_create.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__malloc.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Add.apply(null, arguments);
};

var real__codec2_samples_per_frame = asm["_codec2_samples_per_frame"]; asm["_codec2_samples_per_frame"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__codec2_samples_per_frame.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____errno_location.apply(null, arguments);
};

var real__codec2_destroy = asm["_codec2_destroy"]; asm["_codec2_destroy"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__codec2_destroy.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Lshr.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__free.apply(null, arguments);
};

var real__codec2_bits_per_frame = asm["_codec2_bits_per_frame"]; asm["_codec2_bits_per_frame"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__codec2_bits_per_frame.apply(null, arguments);
};

var real__codec2_decode = asm["_codec2_decode"]; asm["_codec2_decode"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__codec2_decode.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Shl.apply(null, arguments);
};
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var _codec2_create = Module["_codec2_create"] = asm["_codec2_create"];
var _memset = Module["_memset"] = asm["_memset"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _codec2_samples_per_frame = Module["_codec2_samples_per_frame"] = asm["_codec2_samples_per_frame"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var _codec2_destroy = Module["_codec2_destroy"] = asm["_codec2_destroy"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _free = Module["_free"] = asm["_free"];
var _codec2_bits_per_frame = Module["_codec2_bits_per_frame"] = asm["_codec2_bits_per_frame"];
var _codec2_decode = Module["_codec2_decode"] = asm["_codec2_decode"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
;

Runtime.stackAlloc = asm['stackAlloc'];
Runtime.stackSave = asm['stackSave'];
Runtime.stackRestore = asm['stackRestore'];
Runtime.establishStackSpace = asm['establishStackSpace'];

Runtime.setTempRet0 = asm['setTempRet0'];
Runtime.getTempRet0 = asm['getTempRet0'];



// === Auto-generated postamble setup entry stuff ===




function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
      throw e;
    }
  } finally {
    calledMain = true;
  }
}




function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    Module.printErr('run() called, but dependencies remain, so not running');
    return;
  }

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return; 

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  } else if (ENVIRONMENT_IS_SHELL && typeof quit === 'function') {
    quit(status);
  }
  // if we reach here, we must throw an exception to halt the current execution
  throw new ExitStatus(status);
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}






// {{MODULE_ADDITIONS}}



