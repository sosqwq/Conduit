package dev.conduit.tag;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TagController {
    private final TagService tags;

    public TagController(TagService tags) {
        this.tags = tags;
    }

    public record Envelope(List<String> tags) {}

    @GetMapping("/api/tags")
    public Envelope all() {
        return new Envelope(tags.all());
    }
}
