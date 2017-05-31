AC_INIT([dml], [0.0], [jeroen@vreeken.net], [https://dmlinking.net/])
AM_INIT_AUTOMAKE([foreign dist-xz])
AM_SILENT_RULES([yes])
LT_INIT

AC_PROG_CC

AC_CONFIG_MACRO_DIR([m4])


# Check codec2 library

dnl Search for libcodec2
AC_SEARCH_LIBS([freedv_set_data_header], [codec2], [], [
  AC_MSG_ERROR([unable to find the freedv data channel functions in libcodec2])
])

AC_CHECK_HEADERS([codec2/codec2.h codec2/freedv_api.h],
        [codec2_found_headers=yes; break;])

AS_IF([test "x$codec2_found_headers" != "xyes"],
        [AC_MSG_ERROR([Unable to find the codec2 headers])])


# Check ethar library

dnl Search for libeth_ar
AC_SEARCH_LIBS([eth_ar_call2mac], [eth_ar], [], [
  AC_MSG_ERROR([unable to find the eth_ar_call2mac function in libeth_ar])
])

AC_CHECK_HEADERS([eth_ar/eth_ar.h eth_ar/fprs.h],
        [eth_ar_found_headers=yes; break;])

AS_IF([test "x$eth_ar_found_headers" != "xyes"],
        [AC_MSG_ERROR([Unable to find the eth_ar headers])])


AC_OUTPUT([Makefile])
