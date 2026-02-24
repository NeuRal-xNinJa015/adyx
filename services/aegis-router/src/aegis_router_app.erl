%%%-------------------------------------------------------------------
%%% @doc AegisComms Router Application
%%% 
%%% Main OTP application module for the Erlang real-time messaging spine.
%%% Starts Cowboy WebSocket server and the supervision tree.
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
            
            %% Start Cowboy WebSocket listener
            {ok, Port} = application:get_env(aegis_router, listen_port),
            start_cowboy(Port),
            
            io:format("  [OK] AegisComms Router is ONLINE~n~n"),
            {ok, Pid};
        Error ->
            io:format("  [FAIL] Router failed to start: ~p~n", [Error]),
            Error
    end.

%%--------------------------------------------------------------------
%% @doc Start Cowboy HTTP/WebSocket server
%%--------------------------------------------------------------------
start_cowboy(Port) ->
    Dispatch = cowboy_router:compile([
        {'_', [
            {"/ws", aegis_ws_handler, []},
            {"/health", aegis_health_handler, []}
        ]}
    ]),
    
    {ok, _} = cowboy:start_clear(
        aegis_http_listener,
        [{port, Port}],
        #{env => #{dispatch => Dispatch}}
    ),
    io:format("  [OK] Cowboy WebSocket listening on port ~p~n", [Port]),
    io:format("  [OK] WebSocket endpoint: ws://localhost:~p/ws~n", [Port]).

%%--------------------------------------------------------------------
%% @doc Stop the AegisComms router application
%%--------------------------------------------------------------------
stop(_State) ->
    io:format("~n=== AegisComms Router Shutting Down ===~n"),
    io:format("  Draining connections...~n"),
    cowboy:stop_listener(aegis_http_listener),
    io:format("  Flushing offline queues...~n"),
    io:format("  Router OFFLINE~n~n"),
    ok.
