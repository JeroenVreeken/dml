AC_INIT([dml], [0.0], [jeroen@vreeken.net], [https://dmlinking.net/])
AM_INIT_AUTOMAKE([foreign dist-xz])
AM_SILENT_RULES([yes])
LT_INIT

AC_PROG_CC

AC_CONFIG_MACRO_DIR([m4])


# Check for codec2 library

dnl Search for libcodec2
AC_SEARCH_LIBS([freedv_set_data_header], [codec2], [], [
  AC_MSG_ERROR([unable to find the freedv data channel functions in libcodec2])
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

dnl Search for alsa lib
AC_SEARCH_LIBS([snd_pcm_open], [asound], [], [])

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
AC_SEARCH_LIBS([src_simple], [samplerate], [libsamplerate_found=1], [libsamplerate_found=0])

AC_CHECK_HEADERS([samplerate.h], [samplerate_headers_found=yes])


AS_IF([ test "x$flite_headers_found" == "xyes" && \
        test "$libflite_found" == "1" && \
        test "$libflite_cmulex_found" == "1" && \
        test "$libflite_usenglish_found" == "1" && \
	test "$libflite_cmu_us_slt_found" == "1" && \
	test "$libsamplerate_found" == "1" && \
	test "x$samplerate_headers_found" == "xyes" ],
        [CFLAGS+=" -DHAVE_FLITE"])


AC_OUTPUT([Makefile])
