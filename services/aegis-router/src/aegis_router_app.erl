%%%-------------------------------------------------------------------
%%% @doc AegisComms Router Application
%%% 
%%% Main OTP application module for the Erlang real-time messaging spine.
%%% Handles TCP/WebSocket connections, message routing, presence tracking,
%%% delivery acknowledgements, and offline queue management.
%%%
%%% Inspired by WhatsApp's Erlang architecture for handling millions
%%% of concurrent connections with actor-model fault tolerance.
%%%-------------------------------------------------------------------
-module(aegis_router_app).
-behaviour(application).

-export([start/2, stop/1]).

%%--------------------------------------------------------------------
%% @doc Start the AegisComms router application
%%--------------------------------------------------------------------
start(_StartType, _StartArgs) ->
    io:format("~n=== AegisComms Router Starting ===~n"),
    io:format("  Sovereign Communication Infrastructure~n"),
    io:format("  Building secure messaging spine...~n~n"),
    
    %% Start the top-level supervisor
    case aegis_router_sup:start_link() of
        {ok, Pid} ->
            io:format("  [OK] Router supervisor started (PID: ~p)~n", [Pid]),
            {ok, Port} = application:get_env(aegis_router, listen_port),
            io:format("  [OK] Listening on port ~p~n", [Port]),
            io:format("  [OK] AegisComms Router is ONLINE~n~n"),
            {ok, Pid};
        Error ->
            io:format("  [FAIL] Router failed to start: ~p~n", [Error]),
            Error
    end.

%%--------------------------------------------------------------------
%% @doc Stop the AegisComms router application
%%--------------------------------------------------------------------
stop(_State) ->
    io:format("~n=== AegisComms Router Shutting Down ===~n"),
    io:format("  Draining connections...~n"),
    io:format("  Flushing offline queues...~n"),
    io:format("  Router OFFLINE~n~n"),
    ok.
