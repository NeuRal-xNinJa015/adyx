%%%-------------------------------------------------------------------
%%% @doc AegisComms Health Check Handler
%%%
%%% Simple HTTP handler that returns service health status.
%%% Used by load balancers and monitoring systems.
%%%-------------------------------------------------------------------
-module(aegis_health_handler).

-export([init/2]).

init(Req0, State) ->
    ConnCount = gen_server:call(aegis_connection_mgr, count),
    Body = jsx:encode(#{
        <<"service">> => <<"aegis-router">>,
        <<"status">> => <<"online">>,
        <<"connections">> => ConnCount
    }),
    Req = cowboy_req:reply(200,
        #{<<"content-type">> => <<"application/json">>},
        Body, Req0),
    {ok, Req, State}.
