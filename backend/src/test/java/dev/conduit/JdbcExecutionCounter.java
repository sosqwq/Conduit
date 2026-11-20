package dev.conduit;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.atomic.AtomicLong;
import javax.sql.DataSource;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/** Measures executions at the shared JDBC boundary, including ORM and JdbcClient reads. */
final class JdbcExecutionCounter implements BeanPostProcessor {
    private final AtomicLong executed = new AtomicLong();

    long total() {
        return executed.get();
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String name) {
        if (!(bean instanceof DataSource pool)) {
            return bean;
        }
        return new DelegatingDataSource(pool) {
            @Override
            public Connection getConnection() throws SQLException {
                return countedConnection(pool.getConnection());
            }

            @Override
            public Connection getConnection(String username, String password) throws SQLException {
                return countedConnection(pool.getConnection(username, password));
            }
        };
    }

    private Connection countedConnection(Connection connection) {
        return (Connection) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{Connection.class},
                (proxy, method, args) -> {
                    Object result = invoke(connection, method, args);
                    if (result instanceof Statement statement) {
                        return Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{method.getReturnType()},
                                (ignored, operation, values) -> {
                                    if (operation.getName().startsWith("execute")) executed.incrementAndGet();
                                    return invoke(statement, operation, values);
                                });
                    }
                    return result;
                });
    }

    private static Object invoke(Object target, Method method, Object[] params) throws Throwable {
        try {
            return method.invoke(target, params);
        } catch (InvocationTargetException failure) {
            throw failure.getCause();
        }
    }
}
