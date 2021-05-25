ACLOCAL_AMFLAGS=-I m4

CFLAGS+= -Wall -Werror -O3  @GLIB_CFLAGS@


nobase_include_HEADERS = dml/dml.h dml/dml_client.h dml/dml_connection.h dml/dml_crypto.h dml/dml_host.h dml/dml_id.h dml/dml_packet.h dml/dml_route.h dml/dml_stream.h dml/dml_server.h


pkgconfigdir = $(libdir)/pkgconfig
pkgconfig_DATA = dml.pc



lib_LTLIBRARIES=libdml.la

libdml_la_SOURCES = \
	dml_client.c \
	dml_connection.c \
	dml_config.c \
	dml_crypto.c \
	dml_host.c \
	dml_id.c \
	dml_packet.c \
	dml_route.c \
	dml_server.c \
	dml_stream.c 

libdml_la_CFLAGS=-fPIC
libdml_la_LDFLAGS= -shared -fPIC -version-info 0:0:0 @LIB_LDFLAGS@ @GLIB_LIBS@

bin_PROGRAMS = dmld dml_list dml_streamer dml_stream_client dml_stream_client_codec2 dml_fprs_db

DML_SRCS = \
	dml_stream_client_simple.c dml_voice_data.c

ALAW_SRCS = alaw.c

TRX_SRCS = \
	trx_dv.c \
	$(ALAW_SRCS)


FPRS_DB_SRCS = \
	fprs_db.c \
	fprs_parse.c \
	fprs_aprsis.c


dmld_SOURCES = $(DML_SRCS) dmld.c
dmld_LDADD = libdml.la
dmld_LDFLAGS = $(ETH_AR_LIBS)

dml_list_SOURCES = $(DML_SRCS) dml_list.c
dml_list_LDADD = libdml.la
dml_list_LDFLAGS = $(ETH_AR_LIBS)

if ENABLE_DML_REFLECTOR

bin_PROGRAMS += dml_reflector

dml_reflector_SOURCES = $(DML_SRCS) $(TRX_SRCS) dml_reflector.c soundlib.c
dml_reflector_LDADD = libdml.la
dml_reflector_LDFLAGS = $(CODEC2_LIBS) $(ETH_AR_LIBS) -lm

endif

if ENABLE_DML_TRX

bin_PROGRAMS += dml_trx

dml_trx_SOURCES = $(DML_SRCS) $(TRX_SRCS) $(FPRS_DB_SRCS) dml_trx.c soundlib.c
dml_trx_LDADD = libdml.la
dml_trx_LDFLAGS = $(CODEC2_LIBS) $(ETH_AR_LIBS) -lm

endif


dml_streamer_SOURCES = $(DML_SRCS) dml_streamer.c matroska.c ogg.c isom.c
dml_streamer_LDADD = libdml.la
dml_streamer_LDFLAGS = $(ETH_AR_LIBS)


dml_stream_client_SOURCES = $(DML_SRCS) dml_stream_client.c
dml_stream_client_LDADD = libdml.la
dml_stream_client_LDFLAGS = $(ETH_AR_LIBS)

dml_stream_client_codec2_SOURCES = $(DML_SRCS) $(ALAW_SRCS) dml_stream_client_codec2.c
dml_stream_client_codec2_LDADD = libdml.la
dml_stream_client_codec2_LDFLAGS = -lm $(ETH_AR_LIBS) $(CODEC2_LIBS)



if ENABLE_DML_HTTPD

bin_PROGRAMS += dml_httpd

dml_httpd_SOURCES = $(DML_SRCS) dml_httpd.c
dml_httpd_LDADD = libdml.la
dml_httpd_LDFLAGS = -lwebsockets $(MAGIC_LIBS) $(ETH_AR_LIBS)

endif


dml_fprs_db_SOURCES = $(DML_SRCS) $(FPRS_DB_SRCS) dml_fprs_db.c
dml_fprs_db_LDADD = libdml.la
dml_fprs_db_LDFLAGS = $(ETH_AR_LIBS) -lm 

if ENABLE_GDML

bin_PROGRAMS += gdml
gdml_CFLAGS = @GTK_CFLAGS@ @GSTREAMER_CFLAGS@
gdml_LDADD = libdml.la
gdml_LDFLAGS = @GTK_LIBS@ @GSTREAMER_LIBS@

endif
