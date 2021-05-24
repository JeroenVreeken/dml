AC_INIT([dml], [0.0], [jeroen@vreeken.net], [https://dmlinking.net/])
AM_INIT_AUTOMAKE([foreign dist-xz])
AM_SILENT_RULES([yes])
LT_INIT

AC_PROG_CC

AC_CONFIG_MACRO_DIR([m4])


# Are we using emscripten?

AC_COMPILE_IFELSE([AC_LANG_SOURCE([[
#ifndef __EMSCRIPTEN__
# error this is not emscripten
#endif
]])], 
 [EMSCRIPTEN_FOUND="yes"; CFLAGS+=' -I$(srcdir)/wasm_stubs' ],
 [EMSCRIPTEN_FOUND="no" ; LIB_LDFLAGS+=' -lcrypto' ]
)



# Check for codec2 library

dnl Search for libcodec2
PKG_CHECK_MODULES([CODEC2], [codec2], [], [
  AC_MSG_ERROR([unable to find libcodec2])
])

AC_CHECK_HEADERS([codec2/codec2.h codec2/freedv_api.h],
        [codec2_found_headers=yes; break;])

AS_IF([test "x$codec2_found_headers" != "xyes"],
        [AC_MSG_ERROR([Unable to find the codec2 headers])])


# Check for eth_ar library

dnl Search for libeth_ar
AC_SEARCH_LIBS([eth_ar_call2mac], [eth_ar], [], [
  AC_MSG_ERROR([unable to find the eth_ar_call2mac function in libeth_ar])
])

AC_CHECK_HEADERS([eth_ar/eth_ar.h eth_ar/fprs.h],
        [eth_ar_found_headers=yes; break;])

AS_IF([test "x$eth_ar_found_headers" != "xyes"],
        [AC_MSG_ERROR([Unable to find the eth_ar headers])])


# Check for alsa library (flite depends on it but does not link it itself...)

# Check for flite library

dnl Search for flite
AC_SEARCH_LIBS([flite_text_to_wave], [flite], 
        [libflite_found=1], [libflite_found=0])

AC_SEARCH_LIBS([cmu_lex_init], [flite_cmulex], 
        [libflite_cmulex_found=1], [libflite_cmulex_found=0])

AC_SEARCH_LIBS([usenglish_init], [flite_usenglish], 
        [libflite_usenglish_found=1], [libflite_usenglish_found=0])

AC_SEARCH_LIBS([register_cmu_us_slt], [flite_cmu_us_slt], 
        [libflite_cmu_us_slt_found=1], [libflite_cmu_us_slt_found=0])

AC_CHECK_HEADERS([flite/flite.h],
        [flite_headers_found=yes])

dnl Search for libsamplerate
PKG_CHECK_MODULES([SAMPLERATE], [samplerate], [samplerate_found_lib=1], [libsamplerate_found=0])

AC_CHECK_HEADERS([samplerate.h], [samplerate_headers_found=yes])


AS_IF([ test "x$flite_headers_found" == "xyes" && \
        test "$libflite_found" == "1" && \
        test "$libflite_cmulex_found" == "1" && \
        test "$libflite_usenglish_found" == "1" && \
	test "$libflite_cmu_us_slt_found" == "1" && \
	test "$libsamplerate_found" == "1" && \
	test "x$samplerate_headers_found" == "xyes" ],
        [CFLAGS+=" -DHAVE_FLITE"])


dnl Search for libmagic
PKG_CHECK_MODULES([MAGIC], [libmagic], [libmagic_found_lib=yes], [])

AC_CHECK_HEADERS([magic.h],
        [libmagic_found_headers=yes; break;])


# glib
PKG_CHECK_MODULES([GLIB], [glib-2.0])

# gtk+
PKG_CHECK_MODULES([GTK], [gtk+-3.0], [GTK_FOUND=yes], [GTK_FOUND=no])

# gstreamer
PKG_CHECK_MODULES([GSTREAMER], [gstreamer-1.0 >= 1.4], [GSTREAMER_FOUND=yes], [GSTREAMER_FOUND=no])


# build selection logic

AS_IF([test "x$libmagic_found_headers" = "xyes" && test "x$libmagic_found_lib" = "xyes"],
	[enable_dml_httpd="yes"], [enable_dml_httpd="no"]
)

AS_IF([test "x$EMSCRIPTEN_FOUND" = "xno" ],
	[enable_dml_trx="yes"; enable_dml_reflector="yes" ], 
	[enable_dml_trx="no"; enable_dml_reflector="no" ]
)

AS_IF([test "x$GTK_FOUND" = "xyes" && test "x$GSTREAMER_FOUND" = "xyes"], [enable_gdml="yes"], [enable_gdml="no"])


AM_CONDITIONAL(ENABLE_DML_HTTPD, test "x$enable_dml_httpd" = "xyes")
AM_CONDITIONAL(ENABLE_DML_REFLECTOR, test "x$enable_dml_reflector" = "xyes")
AM_CONDITIONAL(ENABLE_DML_TRX, test "x$enable_dml_trx" = "xyes")
AM_CONDITIONAL(ENABLE_GDML, test "x$enable_gdml" = "xyes")


AC_SUBST([LIB_LDFLAGS])

AC_OUTPUT([Makefile])

echo "Optional parts:"
echo "    dml_httpd:     " $enable_dml_httpd
echo "    dml_reflector: " $enable_dml_reflector
echo "    dml_trx:       " $enable_dml_trx
echo "    wasm:          " $EMSCRIPTEN_FOUND
echo "    gdml:          " $enable_gdml
